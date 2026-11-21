// Arranca el panel de administracion (frontend/admin.html + sus scripts) en jsdom, con una sesion de admin y una
// API simuladas, y comprueba que NO hay errores de JavaScript y que las listas se pintan. Existe porque un error
// al iniciar (p. ej. una funcion borrada por accidente) deja el panel vacio y ninguna otra prueba lo detecta.
// Uso (desde backend/): node scripts/probar-panel.js        Sale con codigo 1 si algo falla.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const F = path.join(__dirname, '..', '..', 'frontend');
const html = fs.readFileSync(path.join(F, 'admin.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://sabiasquepr.com/admin.html', pretendToBeVisual: true });
const w = dom.window;
const errores = [];
w.addEventListener('error', (e) => errores.push('error: ' + e.message));
w.addEventListener('unhandledrejection', (e) => errores.push('rechazo: ' + ((e.reason && e.reason.stack) || e.reason)));
w.console.error = (...a) => errores.push('console.error: ' + a.join(' '));
w.alert = (m) => errores.push('alert: ' + m);
w.confirm = () => true;
w.HTMLElement.prototype.scrollIntoView = () => {};
w.SITE_CONFIG = { apiUrl: 'http://api.test', supabaseUrl: 'https://x.supabase.co', supabaseKey: 'k' };
w.supabase = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u1' } } } }), onAuthStateChange: () => {} },
};

const DATOS = {
  contenidos: [{ id: 'c1', titulo: 'Contenido de prueba', seccion: 'educacion', tipo_formato: 'ensayo', fecha_publicacion: '2026-10-01', publicado: false, url_portada: 'p.webp' }],
  productos: [{ id: 'p1', nombre: 'Producto de prueba', precio: 10, imagen: 'x.webp', activo: true }],
  ordenes: [], traducciones: {},
};
const fetchBase = async (url, _opts = {}) => {
  const u = String(url);
  const json = (o) => ({ ok: true, status: 200, json: async () => o });
  if (u.endsWith('/api/me')) return json({ ok: true, user: { id: 'u1', rol: 'admin' } });
  return json({ ok: true, ...DATOS });
};

w.fetch = fetchBase;
w.confirm = () => true;

for (const f of ['ia-herramientas.js', 'editorial.js', 'citas.js', 'clasificacion.js', 'correccion.js', 'admin.js']) {
  try { w.eval(fs.readFileSync(path.join(F, f), 'utf8')); } catch (e) { errores.push(`carga ${f}: ${e.message}`); }
}
// jsdom dispara DOMContentLoaded por si solo al terminar de leer el documento: no se dispara a mano (se iniciaria dos veces).

setTimeout(() => {
  const d = w.document;
  const texto = (id) => (d.getElementById(id) ? d.getElementById(id).textContent : '');
  const comprobaciones = [
    ['el panel se muestra', d.getElementById('admin-panel').style.display === 'block'],
    ['la lista de contenidos se pinta y marca el borrador', texto('admin-contenidos-list').includes('Contenido de prueba') && texto('admin-contenidos-list').includes('Borrador')],
    ['la lista de productos se pinta', texto('admin-productos-list').includes('Producto de prueba')],
    ['los campos llevan la barra de correctores', d.querySelectorAll('.corr-barra').length >= 6],
    ['Contenidos es la primera pestaña y Noticias rápidas ya no existe', !d.getElementById('admin-panel-noticias') && !d.querySelector('[data-tab="noticias"]') && d.getElementById('admin-panel-contenidos').style.display !== 'none'],
    ['las 5 casillas editoriales y la sección Verificador existen', ['ac-actualizada', 'ac-fijada', 'ac-sensible', 'ac-ultima-hora', 'ac-verificada'].every((id) => d.getElementById(id)) && [...d.getElementById('ac-seccion').options].some((o) => o.value === 'verificador')],
    ['ya no están Seguridad, Brigada, Gastos, Reportes ni Taller', !d.getElementById('admin-panel-seguridad') && !d.getElementById('admin-panel-agentes') && !d.getElementById('admin-panel-gastos') && !d.getElementById('admin-panel-reportes') && !d.getElementById('taller-lista')],
  ];
  // Abre el formulario de Contenidos para las pruebas que siguen.
  d.getElementById('admin-contenidos-new').click();
  setTimeout(() => {
    const fallos = comprobaciones.filter(([, ok]) => !ok).map(([n]) => `FALLA: ${n}`);
    const todo = fallos.concat(errores);
    console.log(todo.length ? todo.join('\n') : 'OK: el panel arranca sin errores');
    process.exit(todo.length ? 1 : 0);
  }, 1400);
  // Otras fuentes del formulario de Contenidos: se agregan (hasta 4), se llenan y se leen limpias, y se quitan.
  setTimeout(() => {
    const agregar = d.getElementById('fuentes-extra-agregar-contenido');
    for (let i = 0; i < 6; i += 1) agregar.click();
    const filas = () => d.querySelectorAll('#fuentes-extra-lista-contenido .fuente-extra-fila');
    const tope = filas().length === 4 && agregar.disabled;
    filas()[0].querySelector('.fe-url').value = 'https://www.bbc.com/mundo/nota';
    filas()[1].querySelector('.fe-nombre').value = 'Libro de Freire';
    filas()[0].querySelector('.fe-quitar').click();
    comprobaciones.push(
      ['Otras fuentes: se agregan hasta 4, el botón se desactiva y se pueden quitar', tope && filas().length === 3 && !agregar.disabled],
      ['Otras fuentes: las filas se llenan y quedan en el formulario', filas()[0].querySelector('.fe-nombre').value === 'Libro de Freire'],
    );
  }, 1350);
}, 1500);
