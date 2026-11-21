// Frontend de la Fase 6: borrador / AL AIRE en Contenidos, // reporte de comentarios de artículos y avisos de Mi cuenta.
const fs = require('fs');
const path = require('path');

const frontend = path.join(__dirname, '..', '..', 'frontend');
const leer = (f) => fs.readFileSync(path.join(frontend, f), 'utf8');
const dic = JSON.parse(leer('i18n/en.json'));
const html = leer('admin.html');

describe('Contenidos: Guardar borrador / AL AIRE', () => {
  test('el formulario tiene los dos botones (sin "submit") y la casilla oculta publicado', () => {
    expect(html).toMatch(/<button type="button" class="admin-btn-cancel" id="ac-borrador">Guardar borrador<\/button>/);
    expect(html).toMatch(/<button type="button" class="synth-btn-guardar" id="ac-guardar">▶ AL AIRE<\/button>/);
    expect(html).toContain('id="ac-publicado"');
    const form = html.slice(html.indexOf('id="admin-contenidos-form"'), html.indexOf('id="tr-contenido"'));
    expect(form).not.toMatch(/type="submit"/);
  });

  test('el guardado envía publicado y un borrador nunca va destacado', () => {
    const js = leer('admin.js');
    expect(js).toContain("publicado: document.getElementById('ac-publicado').checked");
    expect(js).toContain("destacado: destacadoPermitido(document.getElementById('ac-destacado').checked, document.getElementById('ac-publicado').checked)");
    expect(js).toContain('enviarContenido(false)');
    expect(js).toContain('enviarContenido(true)');
  });

  test('la lista marca los borradores', () => {
    expect(leer('admin.js')).toContain("c.publicado === false ? '<span class=\"synth-badge synth-badge-borrador\">Borrador</span>'");
  });
});

describe('Reportar comentarios de artículos', () => {
  test('el cuadro de reporte es compartido y se carga antes que debate.js y comentarios.js', () => {
    const paginas = ['articulo.html', 'recurso.html', 'educacion.html', 'revolucion-humana.html'];
    paginas.forEach((p) => {
      const h = leer(p);
      expect(h).toContain('reporte.js');
      const consumidor = h.includes('comentarios.js') ? 'comentarios.js' : 'debate.js';
      expect(h.indexOf('reporte.js')).toBeLessThan(h.indexOf(consumidor));
    });
    expect(leer('sw.js')).toContain("'/reporte.js'");
  });

  test('comentarios.js reporta con el tipo articulo_comentario y el moderador puede eliminar', () => {
    const js = leer('comentarios.js');
    expect(js).toContain("tipo: 'articulo_comentario'");
    expect(js).toContain("currentUserRol === 'moderador'");
    expect(js).toMatch(/currentUser\.id === c\.autor_id\) \? '' : `<button[^`]*comentario-reportar/);
  });

  test('los textos nuevos tienen traducción al inglés', () => {
    ['Moderador', 'Reportar', 'Reporte enviado', 'Inicia sesión para reportar.', 'Ya reportaste esto y sigue pendiente de revisión.',
      'Este nombre se muestra públicamente en tus publicaciones y comentarios. Si lo dejas vacío, se usa un nombre genérico como «Participante-a3f9». No uses tu correo.']
      .forEach((t) => expect(dic[t]).toBeTruthy());
  });
});

describe('Mi cuenta', () => {
  test('avisa que el nombre es público y muestra la etiqueta y el enlace del moderador', () => {
    const cuenta = leer('mi-cuenta.html');
    expect(cuenta).toContain('Este nombre se muestra públicamente');
    const js = leer('mi-cuenta.js');
    expect(js).toContain("moderador: 'Moderador'");
    expect(js).toContain("user.rol === 'admin' || user.rol === 'moderador'");
  });
});
