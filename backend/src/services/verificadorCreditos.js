// Reglas de usos del «Verificador de Confianza» (decididas por el dueño, 2026-11-09). Todo es lógica pura (sin base de datos),
// así se prueba fácil. Una «concesión» es un paquete de usos que el sitio le da a una persona:
//   - tipo 'mensual': 3 usos por cada mes de apoyo mensual. Los no gastados se acumulan 12 meses desde que se otorgaron,
//     SIEMPRE que la persona siga apoyando. Si deja de apoyar, tiene 15 días de gracia para gastarlos y luego se pierden.
//   - tipo 'unico': 1 uso por un apoyo único. (SUPUESTO por confirmar: vale 12 meses.)
// Los reportes ya hechos no dependen de estas reglas: se pueden ver mientras la cuenta esté activa.
const USOS_POR_MES = 3;
const USOS_APOYO_UNICO = 1;
const MESES_VIGENCIA = 12;
const DIAS_GRACIA = 15;
const MS_DIA = 24 * 60 * 60 * 1000;

function sumarMeses(fecha, meses) {
  const d = new Date(fecha);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

function venceEn(concesion) {
  return sumarMeses(concesion.otorgado_en, MESES_VIGENCIA);
}

// ¿Esta concesión todavía sirve hoy?
function estaVigente(concesion, { ahora = new Date(), apoyoMensualActivo = false, apoyoMensualTerminoEn = null } = {}) {
  if (!(ahora < venceEn(concesion))) return false;
  if (concesion.tipo === 'unico') return true;
  if (apoyoMensualActivo) return true;
  if (!apoyoMensualTerminoEn) return false;
  return ahora <= new Date(new Date(apoyoMensualTerminoEn).getTime() + DIAS_GRACIA * MS_DIA);
}

function disponibles(concesion) {
  return Math.max(0, (concesion.cantidad || 0) - (concesion.usados || 0));
}

function saldo(concesiones, estado) {
  return (concesiones || []).filter((c) => estaVigente(c, estado)).reduce((t, c) => t + disponibles(c), 0);
}

// La concesión que conviene gastar primero: la que vence antes (así no se pierde nada).
function elegirConcesion(concesiones, estado) {
  return (concesiones || [])
    .filter((c) => estaVigente(c, estado) && disponibles(c) > 0)
    .sort((a, b) => venceEn(a) - venceEn(b))[0] || null;
}

module.exports = { USOS_POR_MES, USOS_APOYO_UNICO, MESES_VIGENCIA, DIAS_GRACIA, sumarMeses, venceEn, estaVigente, saldo, elegirConcesion };
