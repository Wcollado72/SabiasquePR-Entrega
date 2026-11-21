jest.mock('../middleware/auth', () => require('../test-utils/authMock'));
jest.mock('../db', () => ({ pool: { query: jest.fn(), connect: jest.fn() } }));

// 2026-11-16: casillas editoriales de Contenidos, seccion «verificador», RSS dinamico y migracion automatica.
const request = require('supertest');
const { buildApp } = require('../app');
const { pool } = require('../db');
const { aplicarMigracionesAuto, COLUMNAS_CASILLAS } = require('../migraciones-auto');

const app = buildApp();
const ADMIN = JSON.stringify({ id: 'admin-1', rol: 'admin' });
const VALIDO = {
  seccion: 'noticias', tipoFormato: 'noticia', categoria: 'salud', titulo: 'Un titulo cualquiera', subtituloResumen: 'Un resumen de al menos diez caracteres.',
  urlPortada: 'images/foto.webp', portadaAlt: 'Descripcion', fechaPublicacion: '2026-11-16',
};

beforeEach(() => { pool.query.mockReset(); pool.connect.mockReset(); });

describe('casillas editoriales', () => {
  test('POST guarda las 5 casillas al final del INSERT (en orden) y por defecto en falso', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'x' }] });
    const res = await request(app).post('/api/contenidos').set('x-test-user', ADMIN).send(VALIDO);
    expect(res.status).toBe(201);
    const [sql, values] = pool.query.mock.calls[1];
    expect(sql).toMatch(/ultima_hora, actualizada, fijada, verificada, sensible/);
    expect(values).toHaveLength(36);
    expect(values.slice(-5)).toEqual([false, false, false, false, false]);
  });

  test('POST con casillas marcadas las persiste', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'x' }] });
    await request(app).post('/api/contenidos').set('x-test-user', ADMIN).send({ ...VALIDO, ultimaHora: true, fijada: true, verificada: true });
    const values = pool.query.mock.calls[1][1];
    expect(values.slice(-5)).toEqual([true, false, true, true, false]);   // ultima_hora, actualizada, fijada, verificada, sensible
  });

  test.each(['ultimaHora', 'actualizada', 'fijada', 'verificada', 'sensible'])('400 si «%s» no es verdadero o falso', async (campo) => {
    const res = await request(app).post('/api/contenidos').set('x-test-user', ADMIN).send({ ...VALIDO, [campo]: 'si' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(new RegExp(campo));
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('PUT parcial conserva las casillas que ya tenia', async () => {
    const existente = { id: 'a', seccion: 'noticias', tipo_formato: 'noticia', categoria: 'salud', titulo: 'T', subtitulo_resumen: 'Resumen largo de prueba', url_portada: 'p', portada_alt: 'a', fecha_publicacion: '2026-11-16', publicado: true, ultima_hora: true, fijada: true };
    pool.query.mockResolvedValueOnce({ rows: [existente] }).mockResolvedValueOnce({ rows: [existente] });
    const res = await request(app).put('/api/contenidos/a').set('x-test-user', ADMIN).send({ titulo: 'Otro titulo' });
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[1][0]).toMatch(/ultima_hora=\$32, actualizada=\$33, fijada=\$34, verificada=\$35, sensible=\$36/);
    expect(pool.query.mock.calls[1][1].slice(-5)).toEqual([true, false, true, false, false]);
  });

  test('la lista publica pone primero lo fijado', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/contenidos');
    expect(pool.query.mock.calls[0][0]).toMatch(/ORDER BY fijada DESC, fecha_publicacion DESC/);
  });
});

describe('seccion «verificador» (video instruccional)', () => {
  test('POST de un video para el Verificador se acepta', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'v' }] });
    const res = await request(app).post('/api/contenidos').set('x-test-user', ADMIN)
      .send({ ...VALIDO, seccion: 'verificador', tipoFormato: 'video', categoria: 'cultura', urlMedia: 'https://www.youtube.com/embed/dQw4w9WgXcQ' });
    expect(res.status).toBe(201);
    expect(pool.query.mock.calls[1][1][1]).toBe('verificador');
  });

  test('un video del Verificador sin enlace se rechaza como cualquier video', async () => {
    const res = await request(app).post('/api/contenidos').set('x-test-user', ADMIN).send({ ...VALIDO, seccion: 'verificador', tipoFormato: 'video' });
    expect(res.status).toBe(400);
  });

  test('una seccion inventada sigue rechazada', async () => {
    const res = await request(app).post('/api/contenidos').set('x-test-user', ADMIN).send({ ...VALIDO, seccion: 'deportes' });
    expect(res.status).toBe(400);
  });
});

describe('RSS dinamico (/rss.xml)', () => {
  test('arma el RSS con lo publicado, escapa el texto y no incluye el espacio del Verificador', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'una-pieza', titulo: 'Tom & Jerry <b>', subtitulo_resumen: 'Resumen "con" comillas', categoria: 'ciencia', fecha_publicacion: '2026-11-16' }] });
    const res = await request(app).get('/rss.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/rss\+xml/);
    expect(res.text).toContain('<title>Tom &amp; Jerry &lt;b&gt;</title>');
    expect(res.text).toContain('https://sabiasquepr.com/recurso.html?id=una-pieza');
    expect(res.text).toContain('Resumen &quot;con&quot; comillas');
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toMatch(/publicado = true/);
    expect(sql).toMatch(/seccion <> 'verificador'/);
  });

  test('sin piezas devuelve un RSS valido y vacio', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/rss.xml');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<channel>');
    expect(res.text).not.toContain('<item>');
  });

  test('si la base falla responde 500 generico', async () => {
    pool.query.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/rss.xml');
    expect(res.status).toBe(500);
  });
});

describe('migracion automatica (idempotente)', () => {
  const log = { log: jest.fn(), error: jest.fn() };
  beforeEach(() => { log.log.mockReset(); log.error.mockReset(); });

  test('agrega las 5 columnas con valor por defecto y amplia la lista de secciones una sola vez', async () => {
    const client = { query: jest.fn().mockResolvedValue({}), release: jest.fn() };
    pool.query.mockResolvedValue({ rows: [{ def: "CHECK ((seccion = ANY (ARRAY['revolucion-humana'::text, 'educacion'::text, 'noticias'::text])))" }] });
    pool.connect.mockResolvedValue(client);
    expect(await aplicarMigracionesAuto(pool, log)).toBe(true);
    const sqls = pool.query.mock.calls.map((c) => c[0]);
    for (const col of COLUMNAS_CASILLAS) expect(sqls.some((s) => s.includes(`ADD COLUMN IF NOT EXISTS ${col} boolean NOT NULL DEFAULT false`))).toBe(true);
    expect(client.query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'ALTER TABLE contenidos DROP CONSTRAINT IF EXISTS contenidos_seccion_check', expect.stringContaining("'verificador'"), 'COMMIT']);
    expect(client.release).toHaveBeenCalled();
  });

  test('si la seccion ya esta permitida no vuelve a tocar la restriccion', async () => {
    pool.query.mockResolvedValue({ rows: [{ def: "CHECK (seccion IN ('noticias','verificador'))" }] });
    expect(await aplicarMigracionesAuto(pool, log)).toBe(true);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('nunca tumba el servidor: si falla, lo registra y devuelve false', async () => {
    pool.query.mockRejectedValue(new Error('sin permiso'));
    expect(await aplicarMigracionesAuto(pool, log)).toBe(false);
    expect(log.error).toHaveBeenCalled();
  });

  test('NO borra ni cambia datos: solo ALTER ... ADD COLUMN y la restriccion', async () => {
    pool.query.mockResolvedValue({ rows: [{ def: 'verificador' }] });
    await aplicarMigracionesAuto(pool, log);
    expect(pool.query.mock.calls.map((c) => c[0]).filter((s) => /DELETE|DROP TABLE|UPDATE|TRUNCATE/i.test(s))).toEqual([]);
  });
});
