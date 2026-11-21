// «Búsqueda similar» del Verificador: antes de gastar un uso, se compara lo que la persona envió con sus reportes anteriores.
// Si es muy parecido (mismo enlace, o texto casi igual), el agente se lo señala y pregunta si quiere continuar.
// Solo se guarda una «huella» (enlaces normalizados y palabras clave), nunca más datos de los necesarios.
const UMBRAL_TEXTO = 0.6; // 60 % de palabras en común
const MIN_PALABRAS = 8;
const MAX_HUELLA = 60;
const PALABRAS_VACIAS = new Set(['para', 'como', 'pero', 'esta', 'este', 'esto', 'que', 'con', 'por', 'los', 'las', 'del', 'una', 'uno', 'unos', 'unas', 'y', 'de', 'la', 'el', 'en', 'un', 'se', 'es', 'al', 'lo', 'me', 'mi', 'su']);

function normalizarUrl(u) {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch { return String(u || '').toLowerCase(); }
}

function palabras(texto) {
  const set = new Set(
    String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
      .filter((p) => p.length > 2 && !PALABRAS_VACIAS.has(p))
  );
  return [...set].sort().slice(0, MAX_HUELLA);
}

function crearHuella({ texto, preocupacion, urls }) {
  return { urls: (urls || []).map(normalizarUrl), palabras: palabras(`${texto || ''} ${preocupacion || ''}`) };
}

function jaccard(a, b) {
  const A = new Set(a); const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

// `anteriores`: [{ id, creado_en, entrada: { huella } }]. Devuelve la más parecida o null.
function buscarSimilar(huella, anteriores) {
  let mejor = null;
  for (const r of anteriores || []) {
    const h = r && r.entrada && r.entrada.huella;
    if (!h) continue;
    const mismoEnlace = huella.urls.some((u) => (h.urls || []).includes(u));
    const puntaje = huella.palabras.length >= MIN_PALABRAS && (h.palabras || []).length >= MIN_PALABRAS ? jaccard(huella.palabras, h.palabras) : 0;
    if (mismoEnlace || puntaje >= UMBRAL_TEXTO) {
      const valor = mismoEnlace ? 1 : puntaje;
      if (!mejor || valor > mejor.valor) mejor = { id: r.id, creado_en: r.creado_en, valor };
    }
  }
  return mejor;
}

module.exports = { crearHuella, buscarSimilar, normalizarUrl, palabras, UMBRAL_TEXTO };
