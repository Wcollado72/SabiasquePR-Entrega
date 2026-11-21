const express = require('express');
const { pool } = require('../db');
const { enviarError500 } = require('../util/errores');
const { requireAuth } = require('../middleware/auth');
const { validateReporte } = require('../validators/reporte');

const router = express.Router();

const TABLA_POR_TIPO = { debate_post: 'foro_posts', debate_comentario: 'foro_comentarios', articulo_comentario: 'comentarios' };

// POST /api/reportes -- cualquier usuario con sesion puede reportar (no
// exige edad_confirmada: reportar es una accion de seguridad, no de
// participacion en el debate).
router.post('/', requireAuth, async (req, res) => {
  const errors = validateReporte(req.body);
  if (errors.length) return res.status(400).json({ ok: false, error: errors.join(' ') });
  try {
    const { tipo, itemId, motivo } = req.body;
    const tabla = TABLA_POR_TIPO[tipo];
    const { rows: existe } = await pool.query(`SELECT id FROM ${tabla} WHERE id = $1`, [itemId]);
    if (existe.length === 0) return res.status(404).json({ ok: false, error: 'El elemento reportado no existe.' });

    // El indice unico parcial impide dos reportes pendientes de la misma persona sobre el mismo elemento.
    const { rows } = await pool.query(
      `INSERT INTO reportes (tipo, item_id, reportado_por, motivo) VALUES ($1,$2,$3,$4)
       ON CONFLICT (tipo, item_id, reportado_por) WHERE estado = 'pendiente' AND reportado_por IS NOT NULL DO NOTHING
       RETURNING id, tipo, item_id, reportado_por, motivo, estado, creado_en`,
      [tipo, itemId, req.user.id, motivo.trim()]
    );
    if (rows.length === 0) {
      return res.status(409).json({ ok: false, error: 'Ya reportaste esto y sigue pendiente de revisión.' });
    }
    res.status(201).json({ ok: true, reporte: rows[0] });
  } catch (err) { enviarError500(res, err); }
});

module.exports = router;
