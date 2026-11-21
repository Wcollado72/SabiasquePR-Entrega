// Todos los textos visibles de estas páginas deben tener su traducción al inglés (el botón ES/EN debe cambiar la página completa).
// Nació el 2026-11-19, cuando una prueba en iPhone y Samsung mostró que el Verificador y la página 404 quedaban en español.
const fs = require('fs');
const path = require('path');

const frontend = path.join(__dirname, '..', '..', 'frontend');
const dic = JSON.parse(fs.readFileSync(path.join(frontend, 'i18n', 'en.json'), 'utf8'));
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const claves = new Set(Object.keys(dic).map(norm));
const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const patrones = Object.keys(dic).filter((k) => /\{\w+\}/.test(k)).map((k) => new RegExp('^' + esc(k).replace(/\{(\w+)\}/g, '(.+?)') + '$'));
const tiene = (t) => claves.has(t) || patrones.some((re) => re.test(t));

function textosVisibles(archivo) {
  const html = fs.readFileSync(path.join(frontend, archivo), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = new Set();
  for (const m of html.matchAll(/>([^<>]+)</g)) {
    const t = norm(m[1].replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ''));
    if (/[A-Za-zÁÉÍÓÚáéíóúñÑ]{3}/.test(t)) out.add(t);
  }
  for (const m of html.matchAll(/\b(placeholder|aria-label|title|alt)="([^"]+)"/g)) {
    const t = norm(m[2]);
    if (/[A-Za-zÁÉÍÓÚáéíóúñ]{3}/.test(t)) out.add(t);
  }
  return [...out];
}

describe('Traducción completa al inglés de las páginas públicas', () => {
  test.each(['verificador.html', '404.html', 'premium.html', 'index.html', 'noticias.html', 'tienda.html', 'educacion.html', 'revolucion-humana.html', 'contacto.html', 'mi-cuenta.html'])(
    '%s: no queda ningún texto visible sin traducir', (pagina) => {
      expect(textosVisibles(pagina).filter((t) => !tiene(t))).toEqual([]);
    });

  test('los mensajes y el reporte de ejemplo del Verificador (verificador.js) están traducidos', () => {
    for (const t of ['Revisa tu pedido.', 'Señales de alerta', 'Qué evitar', 'Qué hacer antes de pagar', 'No se pudo completar el reporte.']) {
      expect(tiene(t)).toBe(true);
    }
    expect(tiene('Tu nota tiene más de 200 palabras. Resúmela un poco.')).toBe(true);
    expect(tiene('"foto.png" pesa más de 2 MB.')).toBe(true);
  });

  test('no hay claves repetidas ni vacías', () => {
    const ks = Object.keys(dic);
    expect(new Set(ks.map(norm)).size).toBe(ks.length);
    expect(ks.every((k) => typeof dic[k] === 'string' && dic[k].length > 0)).toBe(true);
  });
});
