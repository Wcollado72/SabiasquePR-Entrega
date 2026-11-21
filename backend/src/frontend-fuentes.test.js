// Taller E4: «otras fuentes» en el panel (formularios de Contenidos y Noticias) y en las páginas públicas.
const fs = require('fs');
const path = require('path');

const frontend = path.join(__dirname, '..', '..', 'frontend');
const leer = (f) => fs.readFileSync(path.join(frontend, f), 'utf8');
const entre = (texto, inicio) => {
  const a = texto.indexOf(`// INICIO ${inicio}`);
  const b = texto.indexOf(`// FIN ${inicio}`);
  if (a < 0 || b < 0) throw new Error(`Faltan las marcas ${inicio}`);
  return texto.slice(a, b);
};
const html = leer('admin.html');
const js = leer('admin.js');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

describe('formularios: dónde se agregan las otras fuentes', () => {
  test.each(['contenido'])('la mesa de %s tiene su lista y su botón «Agregar otra fuente»', (clave) => {
    ['fuentes-extra', 'fuentes-extra-lista', 'fuentes-extra-agregar'].forEach((id) => expect(html).toContain(`id="${id}-${clave}"`));
    expect(js).toContain(`bindFuentesExtra('${clave}');`);
    expect(js).toContain(`pintarFuentesExtra('${clave}', item?.fuentes);`);
    expect(js).toContain(`fuentes: leerFuentesExtraDe('${clave}'),`);
  });

});

describe('funciones puras de las otras fuentes', () => {
  const { limpiarFilasFuentes, htmlFilaFuente, nombreDeUrl } = new Function(`${entre(js, 'fuentes-extra')}
    return { limpiarFilasFuentes, htmlFilaFuente, nombreDeUrl };`)();

  test('el nombre por defecto es el sitio del enlace, sin «www.»', () => {
    expect(nombreDeUrl('https://www.elnuevodia.com/noticias/x')).toBe('elnuevodia.com');
    expect(nombreDeUrl('no es url')).toBe('');
  });

  test('de las filas del formulario salen solo las que tienen algo, con el nombre completado y sin espacios', () => {
    expect(limpiarFilasFuentes([
      { url: ' https://www.bbc.com/mundo/x ', nombre: '' }, { url: '', nombre: '' }, { url: '', nombre: ' Libro de Freire ' },
      { url: 'https://a.com', nombre: 'Medio A' }, { url: 'sin formato', nombre: '' },
    ])).toEqual([
      { nombre: 'bbc.com', url: 'https://www.bbc.com/mundo/x' }, { nombre: 'Libro de Freire', url: '' }, { nombre: 'Medio A', url: 'https://a.com' },
    ]);
  });

  test('la fila escapa lo que traiga y deja los dos campos y el botón de quitar', () => {
    const h = htmlFilaFuente({ nombre: 'Diario "X" <b>', url: 'https://a.com/?a=1&b=2' }, esc);
    expect(h).toContain('value="Diario &quot;X&quot; &lt;b>"');
    expect(h).toContain('value="https://a.com/?a=1&amp;b=2"');
    ['fe-url', 'fe-nombre', 'fe-quitar'].forEach((c) => expect(h).toContain(c));
    expect(htmlFilaFuente({}, esc)).toContain('class="fe-url"');
  });
});

describe('páginas públicas: «Otras fuentes»', () => {
  // Un «document» minimo: lo unico que usa escapeHtml es createElement('div') con textContent -> innerHTML.
  const documentoFalso = {
    createElement: () => {
      let texto = '';
      return {
        set textContent(v) { texto = v; },
        get innerHTML() { return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
      };
    },
  };
  const ventana = {};
  new Function('window', 'document', leer('editorial.js'))(ventana, documentoFalso);
  const otras = ventana.SQPR.otrasFuentesHtml;

  test('lista cada fuente, con enlace solo si es http(s) seguro, y escapa el nombre', () => {
    const h = otras([
      { nombre: 'El Nuevo Día', url: 'https://elnuevodia.com/a?x=1&y=2' }, { nombre: 'Libro <i>', url: '' }, { nombre: 'Trampa', url: 'javascript:alert(1)' },
    ]);
    expect(h).toContain('<p class="article-source article-source-extra">Otras fuentes:</p>');
    expect(h).toContain('<a href="https://elnuevodia.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">El Nuevo Día</a>');
    expect(h).toContain('<li>Libro &lt;i&gt;</li>');
    expect(h).toContain('<li>Trampa</li>');
    expect(h).not.toContain('javascript:');
  });

  test('sin fuentes (o datos raros) no pinta nada', () => {
    expect(otras([])).toBe('');
    expect(otras(undefined)).toBe('');
    expect(otras('x')).toBe('');
    expect(otras([null, { url: 'https://x.com' }])).toBe('');
  });

  test('la página de contenido la usa y el texto está traducido al inglés', () => {
    expect(leer('recurso.js')).toContain('S.otrasFuentesHtml(item.fuentes)');
    expect(JSON.parse(leer('i18n/en.json'))['Otras fuentes:']).toBe('Other sources:');
  });
});
