// Vocabulario seguro del «Verificador de Confianza». REGLA DEL DUEÑO: un reporte NUNCA garantiza, asegura ni promete nada
// (ni «100% seguro», ni «es una estafa» como hecho). El reporte solo describe SEÑALES y deja la decisión a la persona.
// Aunque se le pide a la IA que escriba así, el código lo comprueba y limpia: la regla no depende de que el modelo obedezca.
const AVISO = 'Este reporte describe señales encontradas en la información que enviaste y en fuentes públicas. No garantiza ni asegura nada: ' +
  'ningún análisis puede confirmar que una oferta o una persona sea 100 % segura o insegura, y no es asesoría legal. Verifica por tu cuenta antes de pagar o compartir datos.';

// [patrón, reemplazo]. Los reemplazos bajan la afirmación a una observación.
const REEMPLAZOS = [
  [/\b(100\s?%|cien por ciento)\s+(seguro|segura|confiable|legal|leg[ií]timo|leg[ií]tima|real|verdadero|verdadera)\b/gi, 'con señales favorables'],
  [/\b(te\s+)?(garantizo|garantiza|garantizamos|aseguro|asegura|aseguramos|prometo|promete|prometemos)\b/gi, 'se observa'],
  [/\b(sin\s+(ning[uú]n\s+)?riesgo|libre\s+de\s+riesgo|riesgo\s+cero)\b/gi, 'con riesgo que no se puede descartar'],
  [/\bes\s+(definitivamente|claramente|sin\s+duda)\s+(una\s+)?(estafa|fraude)\b/gi, 'presenta señales de alerta'],
  [/\bes\s+(una\s+)?(estafa|fraude)\b/gi, 'presenta señales de alerta'],
  [/\bno\s+es\s+(una\s+)?(estafa|fraude)\b/gi, 'no mostró señales de alerta claras'],
  [/\b(est[aá]\s+)?(comprobado|confirmado|verificado)\s+que\b/gi, 'las fuentes consultadas indican que'],
  [/\b(totalmente|completamente|absolutamente)\s+(seguro|segura|confiable|leg[ií]timo|leg[ií]tima)\b/gi, 'con señales favorables'],
  [/\b(puedes|puede)\s+(confiar\s+ciegamente|comprar\s+tranquilo|comprar\s+tranquila)\b/gi, 'conviene verificar por tu cuenta'],
  [/\bguaranteed?\b/gi, 'observed'],
];

function suavizar(texto) {
  let t = String(texto == null ? '' : texto);
  let cambios = 0;
  for (const [patron, reemplazo] of REEMPLAZOS) {
    t = t.replace(patron, () => { cambios += 1; return reemplazo; });
  }
  return { texto: t, cambios };
}

// Limpia recursivamente todos los textos de un objeto (listas incluidas). Devuelve cuántos ajustes hizo.
function suavizarObjeto(valor) {
  let ajustes = 0;
  const limpiar = (v) => {
    if (typeof v === 'string') { const r = suavizar(v); ajustes += r.cambios; return r.texto; }
    if (Array.isArray(v)) return v.map(limpiar);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpiar(x)]));
    return v;
  };
  return { valor: limpiar(valor), ajustes };
}

module.exports = { AVISO, suavizar, suavizarObjeto };
