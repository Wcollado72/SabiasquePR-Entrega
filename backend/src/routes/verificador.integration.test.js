jest.mock('../middleware/auth', () => require('../test-utils/authMock'));
jest.mock('../services/verificador');
jest.mock('../services/oracleEntender');
jest.mock('../db', () => ({ pool: { query: jest.fn() } }));

const request = require('supertest');
const { buildApp } = require('../app');
const { verificarOferta } = require('../services/verificador');
const { entenderSolicitud } = require('../services/oracleEntender');
const { pool } = require('../db');
const { crearHuella } = require('../util/busquedaSimilar');

const app = buildApp();
const USUARIO = JSON.stringify({ id: 'u1', rol: 'usuario' });
const ADMIN = JSON.stringify({ id: 'a1', rol: 'admin' });
const REPORTE = { nivel: 'senales_mixtas', resumen: 'r', puntos_a_favor: [], puntos_en_contra: [], detalles_raros: [], que_evitar: [], que_hacer: [], fuentes: [], aviso: 'a' };
const OUT = { reporte: REPORTE, descartadas: 0, ajustesDeVocabulario: 0, excedioTope: false, usage: { tokensEntrada: 1, tokensSalida: 1, busquedasRealizadas: 1, costoEstimadoUsd: 0.05 } };
const AHORA = new Date().toISOString();
const CONC = { id: 'c1', tipo: 'unico', cantidad: 1, usados: 0, otorgado_en: AHORA };
const PNG = Buffer.from('89504e470d0a1a0a0000000d', 'hex').toString('base64');

// Respuestas de la base según la consulta (perfil, concesiones, reportes previos, reserva, etc.).
function baseConUsos(concesiones, reservaOk = true, previos = []) {
  pool.query.mockImplementation(async (sql) => {
    if (/FROM perfiles/.test(sql)) return { rows: [{ rol: 'usuario', apoyo_mensual_termino_en: null }] };
    if (/FROM verificador_concesiones/.test(sql)) return { rows: concesiones };
    if (/SET usados = usados \+ 1/.test(sql)) return { rows: reservaOk ? [{ id: 'c1' }] : [] };
    if (/FROM verificador_reportes/.test(sql)) return { rows: previos };
    if (/INSERT INTO verificador_reportes/.test(sql)) return { rows: [{ id: 'r1', creado_en: AHORA }] };
    return { rows: [] };
  });
}

beforeEach(() => { pool.query.mockReset(); verificarOferta.mockReset(); entenderSolicitud.mockReset(); });

describe('POST /api/verificador', () => {
  test('401 sin sesión', async () => {
    expect((await request(app).post('/api/verificador').send({ texto: 'x' })).status).toBe(401);
  });

  test('400 si no envía nada y no toca la base', async () => {
    const res = await request(app).post('/api/verificador').set('x-test-user', USUARIO).send({});
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('400 si la nota pasa de 200 palabras o un archivo no es seguro', async () => {
    const larga = await request(app).post('/api/verificador').set('x-test-user', USUARIO).send({ texto: 'x', preocupacion: Array(201).fill('a').join(' ') });
    expect(larga.status).toBe(400);
    const malo = await request(app).post('/api/verificador').set('x-test-user', USUARIO).send({ archivos: [{ media_type: 'image/png', data: Buffer.from('hola').toString('base64') }] });
    expect(malo.status).toBe(400);
  });

  test('acepta un cuerpo grande (archivos) sin el límite normal de 100 KB', async () => {
    baseConUsos([CONC]);
    verificarOferta.mockResolvedValue(OUT);
    const grande = Buffer.concat([Buffer.from('89504e47', 'hex'), Buffer.alloc(300000, 1)]).toString('base64');
    const res = await request(app).post('/api/verificador').set('x-test-user', USUARIO).send({ archivos: [{ media_type: 'image/png', data: grande }] });
    expect(res.status).toBe(200);
  });

  test('402 si no tiene usos y no llama a la IA', async () => {
    baseConUsos([]);
    const res = await request(app).post('/api/verificador').set('x-test-user', USUARIO).send({ texto: 'x' });
    expect(res.status).toBe(402);
    expect(verificarOferta).not.toHaveBeenCalled();
  });

  test('200: gasta un uso, guarda el reporte y NO muestra costos', async () => {
    baseConUsos([CONC]);
    verificarOferta.mockResolvedValue(OUT);
    const res = await request(app).post('/api/verificador').set('x-test-user', USUARIO)
      .send({ texto: 'Vendo carro', preocupacion: 'Me preocupa el pago', archivos: [{ media_type: 'image/png', data: PNG }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 'r1', reporte: REPORTE });
    expect(JSON.stringify(res.body)).not.toMatch(/costo|usage|tokens/i);
    expect(verificarOferta.mock.calls[0][0].preocupacion).toBe('Me preocupa el pago');
    const sqls = pool.query.mock.calls.map((c) => c[0]).join('\n');
    expect(sqls).toMatch(/SET usados = usados \+ 1/);
    expect(sqls).toMatch(/INSERT INTO ia_generaciones/);
  });

  test('si la IA falla, devuelve el uso y responde 502', async () => {
    baseConUsos([CONC]);
    verificarOferta.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/api/verificador').set('x-test-user', USUARIO).send({ texto: 'x' });
    expect(res.status).toBe(502);
    expect(res.body.error).not.toMatch(/boom/);
    expect(pool.query.mock.calls.map((c) => c[0]).join('\n')).toMatch(/SET usados = usados - 1/);
  });

  test('402 si otro pedido gastó el último uso a la vez', async () => {
    baseConUsos([CONC], false);
    const res = await request(app).post('/api/verificador').set('x-test-user', USUARIO).send({ texto: 'x' });
    expect(res.status).toBe(402);
    expect(verificarOferta).not.toHaveBeenCalled();
  });

  test('el administrador prueba sin gastar usos', async () => {
    baseConUsos([]);
    verificarOferta.mockResolvedValue(OUT);
    const res = await request(app).post('/api/verificador').set('x-test-user', ADMIN).send({ texto: 'x' });
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls.map((c) => c[0]).join('\n')).not.toMatch(/SET usados/);
  });
});

describe('búsqueda parecida a una anterior', () => {
  const TEXTO = 'Vendo Toyota Corolla 2018 en Fajardo por cuatro mil dolares pago por adelantado sin ver el carro';
  const previos = [{ id: 'r0', creado_en: AHORA, entrada: { huella: crearHuella({ texto: TEXTO }) } }];

  test('409: avisa del reporte anterior, no gasta usos ni llama a la IA', async () => {
    baseConUsos([CONC], true, previos);
    const res = await request(app).post('/api/verificador').set('x-test-user', USUARIO).send({ texto: TEXTO });
    expect(res.status).toBe(409);
    expect(res.body.similar.id).toBe('r0');
    expect(verificarOferta).not.toHaveBeenCalled();
    expect(pool.query.mock.calls.map((c) => c[0]).join('\n')).not.toMatch(/SET usados/);
  });

  test('si la persona confirma (continuar: true), sigue y gasta el uso', async () => {
    baseConUsos([CONC], true, previos);
    verificarOferta.mockResolvedValue(OUT);
    const res = await request(app).post('/api/verificador').set('x-test-user', USUARIO).send({ texto: TEXTO, continuar: true });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/verificador/saldo y /reportes', () => {
  test('saldo: cuenta solo los usos vigentes', async () => {
    baseConUsos([CONC]);
    const res = await request(app).get('/api/verificador/saldo').set('x-test-user', USUARIO);
    expect(res.status).toBe(200);
    expect(res.body.usosDisponibles).toBe(1);
  });

  test('reportes: requiere sesión y solo lee los de la persona', async () => {
    expect((await request(app).get('/api/verificador/reportes')).status).toBe(401);
    pool.query.mockResolvedValue({ rows: [{ id: 'r1', resultado: REPORTE, creado_en: AHORA }] });
    const res = await request(app).get('/api/verificador/reportes').set('x-test-user', USUARIO);
    expect(res.body.reportes).toHaveLength(1);
    expect(pool.query.mock.calls[0][1]).toEqual(['u1']);
  });
});

describe('POST /api/verificador/entender (The Oracle)', () => {
  const url = '/api/verificador/entender';
  const USO = { tokensEntrada: 50, tokensSalida: 30, costoEstimadoUsd: 0.0003 };

  test('401 sin sesión; 400 si no envía nada', async () => {
    expect((await request(app).post(url).send({ texto: 'x' })).status).toBe(401);
    expect((await request(app).post(url).set('x-test-user', USUARIO).send({})).status).toBe(400);
    expect(entenderSolicitud).not.toHaveBeenCalled();
  });

  test('200: devuelve lo que entendió, NO gasta usos, NO muestra costos y registra el gasto', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    entenderSolicitud.mockResolvedValue({ tipo: 'verificar_oferta', resumen: 'Entendí que quieres revisar un anuncio de un auto.', faltan: ['El precio'], usage: USO });
    const res = await request(app).post(url).set('x-test-user', USUARIO).send({ texto: 'Vendo carro' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, tipo: 'verificar_oferta', resumen: 'Entendí que quieres revisar un anuncio de un auto.', faltan: ['El precio'] });
    const sqls = pool.query.mock.calls.map((c) => c[0]).join('\n');
    expect(sqls).toMatch(/INSERT INTO ia_generaciones/);
    expect(sqls).not.toMatch(/verificador_concesiones/);
  });

  test('si la IA falla, 502 con mensaje amable (la pantalla sigue sin bloquearse)', async () => {
    entenderSolicitud.mockRejectedValue(new Error('boom'));
    const res = await request(app).post(url).set('x-test-user', USUARIO).send({ texto: 'x' });
    expect(res.status).toBe(502);
    expect(res.body.error).not.toMatch(/boom/);
  });
});
