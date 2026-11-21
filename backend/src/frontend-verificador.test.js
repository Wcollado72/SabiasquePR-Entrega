const fs = require('fs');
const path = require('path');

const leer = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', f), 'utf8');

describe('Página del Verificador de Confianza', () => {
  const html = leer('verificador.html');
  const js = leer('verificador.js');

  test('tiene la nota de 200 palabras, los formatos seguros y el aviso de que no garantiza', () => {
    expect(html).toContain('máximo 200 palabras');
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain"');
    expect(html).toContain('No garantiza ni asegura nada');
  });

  test('tiene la guía interactiva de 4 pasos y un reporte de ejemplo marcado como ficticio', () => {
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`data-paso="${n}"`);
    expect(html).toContain('id="ver-guia-ejemplo"');
    expect(js).toContain('EJEMPLO FICTICIO');
    expect(js).toContain('no gastó ningún uso');
  });

  test('la guía no usa el almacenamiento sin protección (la página sigue funcionando si falla)', () => {
    expect(js).toMatch(/try \{ localStorage\.setItem/);
    expect(js).toMatch(/try \{ vista = localStorage\.getItem/);
  });

  test('todo lo que dice la IA se pinta con textContent, nunca como HTML', () => {
    expect(js).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
  });

  test('no muestra costos al usuario', () => {
    const sinComentarios = js.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(sinComentarios).not.toMatch(/costo|tokens|usage/i);
  });

  test('el menú tiene el enlace al Verificador', () => {
    expect(leer('index.html')).toContain('href="verificador.html"');
  });

  test('The Oracle entiende el pedido y la persona lo confirma antes de gastar un uso', () => {
    expect(html).toContain('id="ver-oracle-confirma"');
    expect(html).toContain('Sí, continuar');
    expect(html).toContain('Ajustar mi pedido');
    expect(js).toContain('/api/verificador/entender');
    expect(js).toMatch(/\$\('ver-form'\)\.addEventListener\('submit', \(e\) => \{ e\.preventDefault\(\); preguntarOracle\(\)/);
  });

  test('ya no muestra el ranking público de The Oracle ni enlaza a esa página', () => {
    expect(html).not.toContain('ranking-ia');
    expect(html).not.toContain('images/oracle.webp');
  });
});
