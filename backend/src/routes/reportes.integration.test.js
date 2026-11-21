jest.mock('../middleware/auth', () => require('../test-utils/authMock'));
jest.mock('../db', () => ({ pool: { query: jest.fn() } }));

const request = require('supertest');
const { buildApp } = require('../app');
const { pool } = require('../db');

const app = buildApp();

const USUARIO = JSON.stringify({ id: 'user-1', email: 'a@ejemplo.com', rol: 'usuario' });

beforeEach(() => {
  pool.query.mockReset();
});

describe('POST /api/reportes', () => {
  test('401 sin autenticacion', async () => {
    const res = await request(app).post('/api/reportes').send({ tipo: 'debate_post', itemId: 'p1', motivo: 'Amenaza directa.' });
    expect(res.status).toBe(401);
  });

  test('400 si el body es invalido', async () => {
    const res = await request(app).post('/api/reportes')
      .set('x-test-user', USUARIO).send({ tipo: 'otro', itemId: 'p1', motivo: 'x' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('404 si el elemento reportado no existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/reportes')
      .set('x-test-user', USUARIO).send({ tipo: 'debate_post', itemId: 'no-existe', motivo: 'Amenaza directa.' });
    expect(res.status).toBe(404);
  });

  test('201 al reportar un post existente (no exige edad_confirmada)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'r1', tipo: 'debate_post', item_id: 'p1', estado: 'pendiente' }] });
    const res = await request(app).post('/api/reportes')
      .set('x-test-user', JSON.stringify({ id: 'user-1', rol: 'usuario', edad_confirmada: false }))
      .send({ tipo: 'debate_post', itemId: 'p1', motivo: 'Amenaza directa.' });
    expect(res.status).toBe(201);
    const [existsSql] = pool.query.mock.calls[0];
    expect(existsSql).toMatch(/FROM foro_posts WHERE id/);
  });

  test('201 al reportar un comentario existente', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'r2', tipo: 'debate_comentario', item_id: 'c1', estado: 'pendiente' }] });
    const res = await request(app).post('/api/reportes')
      .set('x-test-user', USUARIO).send({ tipo: 'debate_comentario', itemId: 'c1', motivo: 'Acoso directo.' });
    expect(res.status).toBe(201);
    const [existsSql] = pool.query.mock.calls[0];
    expect(existsSql).toMatch(/FROM foro_comentarios WHERE id/);
  });
});

describe('POST /api/reportes -- comentarios de articulos y duplicados (Fase 6)', () => {
  test('201 al reportar un comentario de noticia o contenido (articulo_comentario)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'c9' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'r9', tipo: 'articulo_comentario', item_id: 'c9', estado: 'pendiente' }] });
    const res = await request(app).post('/api/reportes')
      .set('x-test-user', USUARIO).send({ tipo: 'articulo_comentario', itemId: 'c9', motivo: 'Insulta a otra persona.' });
    expect(res.status).toBe(201);
    expect(pool.query.mock.calls[0][0]).toMatch(/FROM comentarios WHERE id/);
  });

  test('409 si esa persona ya tiene un reporte pendiente del mismo elemento', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }] })
      .mockResolvedValueOnce({ rows: [] }); // ON CONFLICT DO NOTHING no devuelve fila
    const res = await request(app).post('/api/reportes')
      .set('x-test-user', USUARIO).send({ tipo: 'debate_post', itemId: 'p1', motivo: 'Otra vez lo mismo.' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/pendiente/);
    expect(pool.query.mock.calls[1][0]).toMatch(/ON CONFLICT \(tipo, item_id, reportado_por\)/);
  });
});
