// Validación de lo que envía una persona al Verificador de Confianza: texto, enlaces, una nota de preocupación (máx. 200
// palabras) y hasta 4 archivos (base64). Solo formatos SEGUROS: imágenes, PDF y texto plano; el código comprueba que el
// contenido real coincida con el tipo declarado (no se confía en el nombre ni en lo que dice el navegador).
const MAX_TEXTO = 8000;
const MAX_URLS = 5;
const MAX_ARCHIVOS = 4;
const MAX_PALABRAS_PREOCUPACION = 200;
const MAX_BASE64_POR_ARCHIVO = 3_000_000; // ~2.2 MB reales
const MAX_BASE64_TOTAL = 6_000_000; // el cuerpo de esta ruta admite 8 MB
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'];

function contarPalabras(t) {
  return String(t || '').trim().split(/\s+/).filter(Boolean).length;
}

// ¿Los primeros bytes del archivo corresponden al tipo declarado?
function coincideConTipo(tipo, data) {
  let buf;
  try { buf = Buffer.from(data, 'base64'); } catch { return false; }
  if (!buf.length) return false;
  const inicio = buf.subarray(0, 12);
  switch (tipo) {
    case 'image/jpeg': return inicio[0] === 0xff && inicio[1] === 0xd8 && inicio[2] === 0xff;
    case 'image/png': return inicio.subarray(0, 4).toString('hex') === '89504e47';
    case 'image/gif': return inicio.subarray(0, 4).toString('latin1') === 'GIF8';
    case 'image/webp': return inicio.subarray(0, 4).toString('latin1') === 'RIFF' && inicio.subarray(8, 12).toString('latin1') === 'WEBP';
    case 'application/pdf': return inicio.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'text/plain': return !buf.includes(0) && buf.length <= 40000;
    default: return false;
  }
}

function validateVerificar(body) {
  const errors = [];
  const { texto, urls, archivos, preocupacion } = body || {};
  if (texto != null && typeof texto !== 'string') errors.push('El texto no es válido.');
  if (typeof texto === 'string' && texto.length > MAX_TEXTO) errors.push(`El texto es demasiado largo (máximo ${MAX_TEXTO} caracteres).`);
  if (preocupacion != null && typeof preocupacion !== 'string') errors.push('Tu nota no es válida.');
  if (typeof preocupacion === 'string' && contarPalabras(preocupacion) > MAX_PALABRAS_PREOCUPACION) {
    errors.push(`Tu nota tiene más de ${MAX_PALABRAS_PREOCUPACION} palabras. Resúmela un poco.`);
  }
  if (urls != null && !Array.isArray(urls)) errors.push('Los enlaces no son válidos.');
  if (Array.isArray(urls)) {
    if (urls.length > MAX_URLS) errors.push(`Máximo ${MAX_URLS} enlaces.`);
    for (const u of urls) {
      let ok;
      try { ok = typeof u === 'string' && u.length <= 2000 && ['http:', 'https:'].includes(new URL(u).protocol); } catch { ok = false; }
      if (!ok) { errors.push('Uno de los enlaces no es una dirección web válida.'); break; }
    }
  }
  if (archivos != null && !Array.isArray(archivos)) errors.push('Los archivos no son válidos.');
  if (Array.isArray(archivos)) {
    if (archivos.length > MAX_ARCHIVOS) errors.push(`Máximo ${MAX_ARCHIVOS} archivos.`);
    let total = 0;
    for (const a of archivos) {
      const ok = a && TIPOS.includes(a.media_type) && typeof a.data === 'string' && a.data && a.data.length <= MAX_BASE64_POR_ARCHIVO && coincideConTipo(a.media_type, a.data);
      if (!ok) { errors.push('Un archivo no es válido o no es seguro. Se aceptan JPG, PNG, WEBP, GIF, PDF y texto (.txt), de menos de 2 MB cada uno.'); break; }
      total += a.data.length;
    }
    if (total > MAX_BASE64_TOTAL) errors.push('Los archivos pesan demasiado en total.');
  }
  const hayAlgo = (typeof texto === 'string' && texto.trim()) || (Array.isArray(urls) && urls.length) || (Array.isArray(archivos) && archivos.length);
  if (!hayAlgo) errors.push('Envía al menos un texto, un enlace o un archivo para poder revisarlo.');
  return errors;
}

module.exports = { validateVerificar, contarPalabras, coincideConTipo, MAX_TEXTO, MAX_URLS, MAX_ARCHIVOS, MAX_PALABRAS_PREOCUPACION, TIPOS };
