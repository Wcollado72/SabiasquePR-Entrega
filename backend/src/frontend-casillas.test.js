// 2026-11-16: «Noticias rápidas» ya no existe; la portada y las noticias salen de Contenidos; casillas editoriales; espacio del video del Verificador; RSS dinámico.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const frontend = path.join(__dirname, '..', '..', 'frontend');
const raiz = path.join(__dirname, '..', '..');
const leer = (f) => fs.readFileSync(path.join(frontend, f), 'utf8');

function cargarEditorial() {
  const ventana = { SITE_CONFIG: { apiUrl: 'http://api.test' } };
  const doc = { createElement: () => { const e = { _t: '' }; Object.defineProperty(e, 'textContent', { set(v) { e._t = String(v); } }); Object.defineProperty(e, 'innerHTML', { get() { return e._t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); } }); return e; } };
  vm.runInNewContext(leer('editorial.js'), { window: ventana, document: doc, location: { search: '' }, console });
  return ventana.SQPR;
}

describe('insignias de las casillas (orden alfabético)', () => {
  const S = cargarEditorial();
  test('sin casillas no agrega nada', () => {
    expect(S.casillasBadgesHtml({})).toBe('');
  });
  test('con las 5 marcadas salen en orden alfabético: Actualizada, Fijada, Sensible, Última hora, Verificada', () => {
    const h = S.casillasBadgesHtml({ ultima_hora: true, actualizada: true, fijada: true, verificada: true, sensible: true });
    const orden = ['Actualizada', 'Fijada', 'Contenido sensible', 'Última hora', 'Verificada'].map((t) => h.indexOf(t));
    expect(orden.every((n) => n > -1)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });
  test('la tarjeta de contenido muestra las insignias', () => {
    const html = S.contenidoCardHtml({ id: 'a', titulo: 'T', subtitulo_resumen: 'R', tipo_formato: 'noticia', categoria: 'salud', url_portada: 'x.webp', fecha_publicacion: '2026-11-16', duracion_min: 1, ultima_hora: true });
    expect(html).toContain('badge-ultima-hora');
  });
});

describe('formulario del panel: casillas en orden alfabético', () => {
  const html = leer('admin.html');
  test('existen las 5 casillas y van en orden alfabético', () => {
    const ids = ['ac-actualizada', 'ac-fijada', 'ac-sensible', 'ac-ultima-hora', 'ac-verificada'];
    const pos = ids.map((id) => html.indexOf(`id="${id}"`));
    expect(pos.every((n) => n > -1)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });
  test('admin.js las lee y las carga con los mismos nombres que usa el servidor', () => {
    const js = leer('admin.js');
    ['ultimaHora', 'actualizada', 'fijada', 'verificada', 'sensible'].forEach((c) => expect(js).toContain(`${c}: document.getElementById(`));
    expect(js).toContain("['ac-ultima-hora', 'ultima_hora']");
  });
  test('la sección «Verificador» se puede escoger y el panel arranca en Contenidos', () => {
    expect(html).toContain('<option value="verificador">');
    expect(html).toMatch(/class="foro-filter-btn active" data-tab="contenidos"/);
  });
});

describe('Noticias rápidas ya no existe: todo sale de Contenidos', () => {
  test.each(['home.js', 'noticias.js', 'articulo.js', 'admin.js', 'recurso.js'])('%s no pide /api/noticias', (f) => {
    expect(leer(f)).not.toMatch(/\/api\/noticias/);
  });
  test('la portada pide la sección Noticias de Contenidos y pinta con la tarjeta de contenido', () => {
    const js = leer('home.js');
    expect(js).toContain("/api/contenidos?seccion=noticias");
    expect(js).toContain('contenidoCardHtml(featured)');
  });
  test('el collage de Noticias lee solo Contenidos y deja fuera el espacio del Verificador', () => {
    const js = leer('noticias.js');
    expect(js).toContain("seccion !== 'verificador'");
    expect(js).not.toContain('noticiaComoContenido');
  });
  test('un enlace viejo articulo.html?id=x pasa a recurso.html?id=x', () => {
    const destinos = [];
    // Se prueba con una copia del código sobre un objeto location propio.
    const codigo = leer('articulo.js').replace(/location\.replace/g, 'fakeLocation.replace').replace(/location\.search/g, 'fakeLocation.search');
    new Function('fakeLocation', 'URLSearchParams', codigo)({ search: '?id=mi-noticia', replace: (u) => destinos.push(u) }, URLSearchParams);
    expect(destinos).toEqual(['recurso.html?id=mi-noticia']);
  });
  test('recurso.js conoce las secciones Noticias y Verificador', () => {
    const js = leer('recurso.js');
    expect(js).toContain("'noticias': 'Noticias'");
    expect(js).toContain("'verificador': 'verificador.html'");
  });
});

describe('espacio del video del Verificador', () => {
  test('la página trae el espacio nuevo y conserva la guía de 4 pasos', () => {
    const html = leer('verificador.html');
    expect(html).toContain('id="ver-video-caja"');
    expect(html).toContain('Pronto verás aquí un video corto');
    ['ver-guia', 'ver-guia-sig', 'ver-guia-abrir'].forEach((id) => expect(html).toContain(`id="${id}"`));
    expect(html.indexOf('id="ver-video"')).toBeLessThan(html.indexOf('id="ver-login"'));
  });
  test('verificador.js pide la sección «verificador», solo acepta https y arma el iframe sin HTML en línea', () => {
    const js = leer('verificador.js');
    expect(js).toContain("/api/contenidos?seccion=verificador");
    expect(js).toContain('/^https:\\/\\//');
    expect(js).toContain("document.createElement('iframe')");
  });
});

describe('RSS dinámico', () => {
  test('Netlify pide /rss.xml al servidor y ya no existe el archivo fijo ni su generación', () => {
    const toml = fs.readFileSync(path.join(raiz, 'netlify.toml'), 'utf8');
    expect(toml).toMatch(/from = "\/rss\.xml"\s+to = "https:\/\/sabiasquepr-backend-uufz\.onrender\.com\/rss\.xml"\s+status = 200/);
    expect(fs.existsSync(path.join(frontend, 'rss.xml'))).toBe(false);
    expect(leer('build.js')).not.toContain('generateRSS');
  });
});

describe('copia de seguridad del contenido que se vació', () => {
  test('el sitio no sirve archivos de respaldo (.bak) desde la carpeta publicada', () => {
    const sobrantes = fs.readdirSync(frontend).filter((f) => /\.bak/i.test(f));
    expect(sobrantes).toEqual([]);
  });
});
