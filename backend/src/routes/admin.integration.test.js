jest.mock('../middleware/auth', () => require('../test-utils/authMock'));
jest.mock('../services/articleExtractor');
jest.mock('../db', () => ({ pool: { query: jest.fn() } }));

const request = require('supertest');
const { buildApp } = require('../app');
const { extraerArticulo } = require('../services/articleExtractor');
const { pool } = require('../db');

const app = buildApp();

const ADMIN = JSON.stringify({ id: 'admin-1', rol: 'admin' });
const USUARIO = JSON.stringify({ id: 'user-1', rol: 'usuario' });
const MODERADOR = JSON.stringify({ id: 'mod-1', rol: 'moderador' });

beforeEach(() => {
  extraerArticulo.mockReset();
  pool.query.mockReset();
});

describe('GET /api/admin/estado-seguridad', () => {
  test('401 sin autenticacion', async () => {
    const res = await request(app).get('/api/admin/estado-seguridad');
    expect(res.status).toBe(401);
  });

  test('403 si el usuario no es admin ni moderador', async () => {
    const res = await request(app).get('/api/admin/estado-seguridad').set('x-test-user', USUARIO);
    expect(res.status).toBe(403);
  });

  test('200 con los datos reales para un admin', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ n: 2 }] })
      .mockResolvedValueOnce({ rows: [{ n: 5 }] });
    const res = await request(app).get('/api/admin/estado-seguridad').set('x-test-user', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      cooldownActivos: 2,
      cooldownHoras: 1,
      edadConfirmadasTotal: 5,
      turnstileActivo: expect.any(Boolean),
      rateLimitConfig: { general: 300, escritura: 20, ventanaMin: 15 },
    });
  });

  test('200 para un moderador', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });
    const res = await request(app).get('/api/admin/estado-seguridad').set('x-test-user', MODERADOR);
    expect(res.status).toBe(200);
  });
});


describe('GET /api/admin/ordenes (P-3)', () => {
  test('401 sin autenticacion', async () => {
    const res = await request(app).get('/api/admin/ordenes');
    expect(res.status).toBe(401);
  });

  test('403 si el usuario no es admin (ni siquiera moderador)', async () => {
    expect((await request(app).get('/api/admin/ordenes').set('x-test-user', USUARIO)).status).toBe(403);
    expect((await request(app).get('/api/admin/ordenes').set('x-test-user', MODERADOR)).status).toBe(403);
  });

  test('200 con los pedidos, direccion y valores por defecto de paginacion', async () => {
    const fila = { id: 'o1', estado: 'pagada', total: '25.00', items: [{ nombre: 'Taza', cantidad: 1 }], envio_nombre: 'Ana', envio_direccion: { city: 'Fajardo' }, comprador_email: 'a@ejemplo.com' };
    pool.query.mockResolvedValueOnce({ rows: [fila] });
    const res = await request(app).get('/api/admin/ordenes').set('x-test-user', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, limit: 50, offset: 0 });
    expect(res.body.ordenes).toEqual([fila]);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM ordenes o LEFT JOIN perfiles pf/);
    expect(sql).toMatch(/envio_direccion/);
    expect(sql).toMatch(/facturacion_direccion/);
    expect(sql).toMatch(/ORDER BY o\.creado_en DESC/);
    expect(params).toEqual([50, 0]);
  });

  test('limit tiene tope de 100 y offset nunca es negativo', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/admin/ordenes?limit=5000&offset=-3').set('x-test-user', ADMIN);
    expect(res.body).toMatchObject({ limit: 100, offset: 0 });
    expect(pool.query.mock.calls[0][1]).toEqual([100, 0]);
    await request(app).get('/api/admin/ordenes?limit=10&offset=20').set('x-test-user', ADMIN);
    expect(pool.query.mock.calls[1][1]).toEqual([10, 20]);
  });
});
