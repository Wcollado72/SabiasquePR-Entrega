const express = require('express');
const { pool } = require('../db');
const { enviarError500 } = require('../util/errores');
const { requireAuth, requireAdmin, requireModerador } = require('../middleware/auth');
const { validateTraduccion, TIPOS_VALIDOS, IDIOMAS_VALIDOS } = require('../validators/traduccion');

const router = express.Router();

// Limites configurados en app.js (rate limiting) -- se muestran como dato de
// configuracion, no de uso en vivo: express-rate-limit usa un MemoryStore
// interno no expuesto fuera de app.js, asi que no hay forma honesta de leer
// "uso actual %" sin instrumentar un store custom (fuera de alcance hoy).
const RATE_LIMIT_CONFIG = { general: 300, escritura: 20, ventanaMin: 15 };
const COOLDOWN_HORAS_CUENTA_NUEVA = 1;

// GET /api/admin/estado-seguridad -- admin o moderador. Solo devuelve datos
// que se pueden calcular de verdad hoy (ver comentarios de cada campo) --
// nunca numeros de ejemplo/inventados.
router.get('/estado-seguridad', requireAuth, requireModerador, async (req, res) => {
  try {
    const [cooldown, edad] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM perfiles WHERE creado_en > now() - interval '${COOLDOWN_HORAS_CUENTA_NUEVA} hour'`),
      pool.query('SELECT COUNT(*)::int AS n FROM perfiles WHERE edad_confirmada = true'),
    ]);
    res.json({
      ok: true,
      cooldownActivos: cooldown.rows[0].n,
      cooldownHoras: COOLDOWN_HORAS_CUENTA_NUEVA,
      edadConfirmadasTotal: edad.rows[0].n,
      turnstileActivo: Boolean(process.env.TURNSTILE_SECRET_KEY),
      rateLimitConfig: RATE_LIMIT_CONFIG,
    });
  } catch (err) { enviarError500(res, err); }
});

// GET /api/admin/ordenes -- solo admin. Pedidos de la tienda, los mas recientes
// primero, con la direccion de envio/facturacion para poder despacharlos.
// Incluye el correo del comprador (dato de contacto, solo visible aqui).
router.get('/ordenes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { rows } = await pool.query(
      `SELECT o.id, o.estado, o.total, o.items, o.envio_nombre, o.envio_direccion, o.facturacion_direccion,
              o.creado_en, o.usuario_id, pf.email AS comprador_email
       FROM ordenes o LEFT JOIN perfiles pf ON pf.id = o.usuario_id
       ORDER BY o.creado_en DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ ok: true, ordenes: rows, limit, offset });
  } catch (err) { enviarError500(res, err); }
});

// ── TRADUCCIONES (Fase C2) ──────────────────────────────────
// El nombre de la tabla sale de este mapa (nunca del request) para que el
// tipo que manda el cliente no pueda inyectar SQL.
const TABLA_POR_TIPO = { noticia: 'noticias', contenido: 'contenidos', producto: 'productos' };

async function cargarPieza(tipo, id) {
  const { rows } = await pool.query(`SELECT * FROM ${TABLA_POR_TIPO[tipo]} WHERE id = $1`, [id]);
  return rows[0] || null;
}

function idiomaOriginalDe(pieza) {
  return pieza.idioma_original === 'en' ? 'en' : 'es';
}

function tipoValido(res, tipo) {
  if (TIPOS_VALIDOS.includes(tipo)) return true;
  res.status(400).json({ ok: false, error: 'Tipo de contenido no valido.' });
  return false;
}

// GET /api/admin/traducciones/:tipo/:id -- traducciones guardadas de una pieza
router.get('/traducciones/:tipo/:id', requireAuth, requireAdmin, async (req, res) => {
  const { tipo, id } = req.params;
  if (!tipoValido(res, tipo)) return;
  try {
    const pieza = await cargarPieza(tipo, id);
    if (!pieza) return res.status(404).json({ ok: false, error: 'Contenido no encontrado.' });
    const { rows } = await pool.query(
      'SELECT idioma, campos, actualizado_en FROM traducciones WHERE tipo = $1 AND item_id = $2',
      [tipo, id]
    );
    res.json({
      ok: true,
      idiomaOriginal: idiomaOriginalDe(pieza),
      traducciones: Object.fromEntries(rows.map((r) => [r.idioma, { campos: r.campos, actualizadoEn: r.actualizado_en }])),
    });
  } catch (err) { enviarError500(res, err); }
});

// PUT /api/admin/traducciones/:tipo/:id/:idioma -- guardar (crear o reemplazar)
router.put('/traducciones/:tipo/:id/:idioma', requireAuth, requireAdmin, async (req, res) => {
  const { tipo, id, idioma } = req.params;
  const { errors, campos } = validateTraduccion(tipo, idioma, req.body && req.body.campos);
  if (errors.length) return res.status(400).json({ ok: false, error: errors.join(' ') });
  try {
    const pieza = await cargarPieza(tipo, id);
    if (!pieza) return res.status(404).json({ ok: false, error: 'Contenido no encontrado.' });
    if (idiomaOriginalDe(pieza) === idioma) {
      return res.status(400).json({ ok: false, error: 'Ese ya es el idioma original de la pieza; edita la pieza directamente.' });
    }
    await pool.query(
      `INSERT INTO traducciones (tipo, item_id, idioma, campos, actualizado_por)
       VALUES ($1,$2,$3,$4::jsonb,$5)
       ON CONFLICT (tipo, item_id, idioma)
       DO UPDATE SET campos = EXCLUDED.campos, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por`,
      [tipo, id, idioma, JSON.stringify(campos), req.user.id]
    );
    res.json({ ok: true, campos });
  } catch (err) { enviarError500(res, err); }
});

// DELETE /api/admin/traducciones/:tipo/:id/:idioma
router.delete('/traducciones/:tipo/:id/:idioma', requireAuth, requireAdmin, async (req, res) => {
  const { tipo, id, idioma } = req.params;
  if (!tipoValido(res, tipo)) return;
  if (!IDIOMAS_VALIDOS.includes(idioma)) return res.status(400).json({ ok: false, error: 'Idioma no valido.' });
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM traducciones WHERE tipo = $1 AND item_id = $2 AND idioma = $3',
      [tipo, id, idioma]
    );
    if (rowCount === 0) return res.status(404).json({ ok: false, error: 'No hay traduccion guardada en ese idioma.' });
    res.json({ ok: true });
  } catch (err) { enviarError500(res, err); }
});

module.exports = router;
