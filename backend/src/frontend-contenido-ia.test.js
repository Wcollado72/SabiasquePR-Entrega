// Formulario de Contenidos: etiquetas sin parentesis.
const fs = require('fs');
const path = require('path');

const frontend = path.join(__dirname, '..', '..', 'frontend');
const leer = (f) => fs.readFileSync(path.join(frontend, f), 'utf8');
const html = leer('admin.html');

describe('etiquetas del formulario de Contenidos', () => {
  test.each([
    ['ac-subtitulo', 'Resumen'],
    ['ac-cuerpo', 'Cuerpo del texto'],
    ['ac-autor', 'Autor'],
    ['ac-fuente-texto', 'Nombre de la fuente'],
  ])('«%s» no lleva texto entre paréntesis', (id, etiqueta) => {
    expect(html).toContain(`<label for="${id}">${etiqueta}</label>`);
  });

  test('el Resumen no tiene tope de largo (solo un mínimo para que no se guarde vacío)', () => {
    const t = html.match(/<textarea id="ac-subtitulo"[^>]*>/)[0];
    expect(t).not.toMatch(/maxlength/i);
    expect(t).toContain('minlength="10"');
  });
});
