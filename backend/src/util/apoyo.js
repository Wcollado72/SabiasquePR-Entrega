// Montos del apoyo mensual (USD). El mínimo lo decidió el administrador (2026-11-10): $1. Los usos del Verificador son FIJOS (3 al mes)
// sin importar el monto. Si se cambia el mínimo, cámbialo aquí (el servidor valida) y en frontend/premium.js (solo para mostrar).
const MONTO_MINIMO = 1;
const MONTO_MAXIMO = 500;
const MONTOS_SUGERIDOS = [1, 5, 10, 25];

// Devuelve { ok:true, centavos } o { ok:false, error }.
function validarMonto(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return { ok: false, error: 'La cantidad no es válida.' };
  if (valor < MONTO_MINIMO) return { ok: false, error: `La cantidad mínima es $${MONTO_MINIMO}.` };
  if (valor > MONTO_MAXIMO) return { ok: false, error: `La cantidad máxima es $${MONTO_MAXIMO}.` };
  return { ok: true, centavos: Math.round(valor * 100) };
}

module.exports = { MONTO_MINIMO, MONTO_MAXIMO, MONTOS_SUGERIDOS, validarMonto };
