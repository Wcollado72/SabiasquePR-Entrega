// Mesa de agentes arriba de los formularios, una sola URL, una sola caja de idioma, cada función
// con una sola dueña .
const fs = require('fs');
const path = require('path');

const frontend = path.join(__dirname, '..', '..', 'frontend');
const leer = (f) => fs.readFileSync(path.join(frontend, f), 'utf8');
const html = leer('admin.html');
const js = leer('admin.js');
const cuantos = (texto, id) => (texto.match(new RegExp(`id="${id}"`, 'g')) || []).length;
const niveles = (id) => {
  const nav = html.slice(html.indexOf(`id="${id}"`), html.indexOf('</nav>', html.indexOf(`id="${id}"`)));
  return [...nav.matchAll(/data-panel="([a-z]+)"/g)].map((m) => m[1]);
};

describe('orden de los niveles: los agentes primero', () => {
  test('Contenidos: Clasificación, Contenido, Multimedia y Citación', () => {
    expect(niveles('synth-levels')).toEqual(['clasificacion', 'contenido', 'multimedia', 'citacion']);
  });

  test('Noticias rápidas ya no existe (2026-11-16): su espacio vive en Contenidos > sección Noticias', () => {
    expect(html).not.toContain('id="news-levels"');
    expect(html).not.toContain('id="an-autocompletar-url"');
  });

  test('el panel visible al abrir una pieza nueva es el de los agentes y la numeración sigue el orden', () => {
    expect(html).toMatch(/<section class="synth-panel" data-panel="clasificacion">/);
    ['NIVEL 1 — CLASIFICACIÓN', 'NIVEL 2 — CONTENIDO', 'NIVEL 3 — MULTIMEDIA', 'NIVEL 4 — CITACIÓN']
      .forEach((t) => expect(html).toContain(t));
    expect(js).toContain("activarSynthPanel('clasificacion')");
  });
});

describe('sin cajas repetidas: una sola URL y una sola caja de idioma', () => {
  test.each([
    ['contenido', ['ia-url', 'ia-titulo-sugerido', 'ia-idioma', 'ac-fuente-url']],
    ['noticia', ['an-autocompletar-url', 'an-fuente-url']],
  ])('%s: ya no existen las cajas viejas', (_, ids) => {
    ids.forEach((id) => expect(html).not.toContain(`id="${id}"`));
  });

  test('la URL de la fuente es una sola, la de la mesa (en Noticias sigue siendo obligatoria)', () => {
    expect(cuantos(html, 'brigada-url-contenido')).toBe(1);
    expect(cuantos(html, 'brigada-url-noticia')).toBe(0);
  });

  test('el idioma de la pieza es una sola caja, en la mesa, y no está en la pestaña Clasificación', () => {
    ['ac-idioma-original'].forEach((id) => expect(cuantos(html, id)).toBe(1));
    const mesa = html.slice(html.indexOf('<section class="brigada-mesa"'), html.indexOf('id="synth-levels"'));
    expect(mesa).toContain('id="ac-idioma-original"');
    const clasif = html.slice(html.indexOf('<section class="synth-panel" data-panel="clasificacion"'), html.indexOf('<section class="synth-panel" data-panel="contenido"'));
    expect(clasif).not.toContain('idioma');
    expect(js).not.toContain("'ia-idioma'");
  });
});

describe('pestañas del panel: Seguridad, Brigada, Gastos, Reportes, Taller y Noticias rápidas ya no están (viven en otro panel o en Contenidos)', () => {
  test.each(['seguridad', 'agentes', 'gastos', 'reportes', 'taller', 'noticias'])('no existe la pestaña %s', (tab) => {
    expect(html).not.toContain(`data-tab="${tab}"`);
    expect(html).not.toContain(`id="admin-panel-${tab}"`);
  });
});
