// Verificador de Confianza (usuarios con usos disponibles). Los costos NUNCA salen en las respuestas: solo se guardan en
// `ia_generaciones` para el panel del dueño. El administrador puede probarlo sin gastar usos (para pruebas y revisión).
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateVerificar } = require('../validators/verificador');
const { verificarOferta } = require('../services/verificador');
const { entenderSolicitud } = require('../services/oracleEntender');
const { saldo, elegirConcesion, venceEn } = require('../services/verificadorCreditos');
const { registrarUsoAgente } = require('../util/usoIa');
const { crearHuella, buscarSimilar } = require('../util/busquedaSimilar');

const router = express.Router();

// Estado de apoyo mensual de la persona: rol premium = apoyando ahora; si dejó de apoyar, la fecha en que terminó.
async function cargarEstado(userId, rolDelToken) {
  const { rows: pf } = await pool.query('SELECT rol, apoyo_mensual_termino_en FROM perfiles WHERE id = $1', [userId]);
  const rol = (pf[0] && pf[0].rol) || rolDelToken;
  const { rows: concesiones } = await pool.query(
    'SELECT id, tipo, cantidad, usados, otorgado_en FROM verificador_concesiones WHERE usuario_id = $1 ORDER BY otorgado_en',
    [userId]
  );
  const estado = {
    ahora: new Date(),
    apoyoMensualActivo: rol === 'premium',
    apoyoMensualTerminoEn: pf[0] ? pf[0].apoyo_mensual_termino_en : null,
  };
  return { rol, concesiones, estado };
}

router.get('/saldo', requireAuth, async (req, res) => {
  try {
    const { concesiones, estado } = await cargarEstado(req.user.id, req.user.rol);
    const sig = elegirConcesion(concesiones, estado);
    res.json({ ok: true, usosDisponibles: saldo(concesiones, estado), venceProximo: sig ? venceEn(sig) : null });
  } catch (err) {
    console.error('Error leyendo el saldo del Verificador:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo consultar tu saldo.' });
  }
});

router.get('/reportes', requireAuth, async (req, res) => {
  try {
    // Ver reportes ya hechos NO exige apoyo activo, solo cuenta activa (decisión del dueño).
    const { rows } = await pool.query(
      'SELECT id, resultado, creado_en FROM verificador_reportes WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ ok: true, reportes: rows });
  } catch (err) {
    console.error('Error leyendo reportes del Verificador:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudieron cargar tus reportes.' });
  }
});

// The Oracle entiende el pedido y se lo resume a la persona ANTES de gastar un uso. No gasta usos ni guarda reportes.
router.post('/entender', requireAuth, async (req, res) => {
  const errors = validateVerificar(req.body);
  if (errors.length) return res.status(400).json({ ok: false, error: errors[0] });
  const { texto, urls, archivos, preocupacion } = req.body;
  try {
    const r = await entenderSolicitud({
      texto: (texto || '').trim(), urls: urls || [], preocupacion: (preocupacion || '').trim(), archivos: (archivos || []).length,
    });
    await registrarUsoAgente(pool, { agente: 'verificador', fuenteTipo: 'texto', usage: r.usage, creadoPor: req.user.id });
    res.json({ ok: true, tipo: r.tipo, resumen: r.resumen, faltan: r.faltan });
  } catch (err) {
    console.error('Error de The Oracle al entender el pedido:', err.message);
    res.status(502).json({ ok: false, error: 'The Oracle no pudo revisar tu pedido ahora.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const errors = validateVerificar(req.body);
  if (errors.length) return res.status(400).json({ ok: false, error: errors[0] });
  const { texto, urls, archivos, preocupacion, continuar } = req.body;
  const huella = crearHuella({ texto, preocupacion, urls });
  const esAdmin = req.user.rol === 'admin';
  let reservada = null;
  try {
    // Búsqueda parecida a una anterior: se le avisa y se pregunta si continúa (no se gasta nada hasta que diga que sí).
    if (continuar !== true) {
      const { rows: previos } = await pool.query(
        'SELECT id, entrada, creado_en FROM verificador_reportes WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT 50',
        [req.user.id]
      );
      const parecido = buscarSimilar(huella, previos);
      if (parecido) {
        return res.status(409).json({
          ok: false, similar: { id: parecido.id, creado_en: parecido.creado_en },
          error: 'Ya hiciste una búsqueda muy parecida. Puedes revisar ese reporte o continuar con una nueva (se gastará un uso).',
        });
      }
    }
    if (!esAdmin) {
      const { concesiones, estado } = await cargarEstado(req.user.id, req.user.rol);
      const elegida = elegirConcesion(concesiones, estado);
      if (!elegida) {
        return res.status(402).json({ ok: false, error: 'No tienes usos disponibles del Verificador. Los usos se ganan con tu apoyo al sitio.' });
      }
      // Reserva atómica: dos pedidos a la vez no pueden gastar el mismo uso.
      const { rows } = await pool.query(
        'UPDATE verificador_concesiones SET usados = usados + 1 WHERE id = $1 AND usados < cantidad RETURNING id',
        [elegida.id]
      );
      if (!rows.length) return res.status(402).json({ ok: false, error: 'No tienes usos disponibles del Verificador.' });
      reservada = elegida.id;
    }
    let out;
    try {
      out = await verificarOferta({ texto: (texto || '').trim(), urls: urls || [], archivos: archivos || [], preocupacion: (preocupacion || '').trim() });
    } catch (err) {
      if (reservada) await pool.query('UPDATE verificador_concesiones SET usados = usados - 1 WHERE id = $1 AND usados > 0', [reservada]);
      console.error('Error del Verificador:', err.message);
      return res.status(502).json({ ok: false, error: 'No se pudo completar el reporte. No se gastó ningún uso; intenta de nuevo.' });
    }
    await registrarUsoAgente(pool, { agente: 'verificador', fuenteTipo: 'notas', usage: out.usage, creadoPor: req.user.id });
    if (out.excedioTope) console.error(`Verificador: un reporte pasó del tope de costo (${out.usage.costoEstimadoUsd.toFixed(4)} USD).`);
    const { rows } = await pool.query(
      'INSERT INTO verificador_reportes (usuario_id, entrada, resultado) VALUES ($1,$2,$3) RETURNING id, creado_en',
      [req.user.id, JSON.stringify({ tieneTexto: !!(texto && texto.trim()), urls: urls || [], archivos: (archivos || []).length, huella }), JSON.stringify(out.reporte)]
    );
    res.json({ ok: true, id: rows[0] && rows[0].id, reporte: out.reporte });
  } catch (err) {
    console.error('Error en el Verificador:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo procesar tu pedido.' });
  }
});

module.exports = router;
