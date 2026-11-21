// ============================================================
// verificador.js — Sabías que PR · Verificador de Confianza (pantalla de la persona usuaria)
// ============================================================
// Envía lo que la persona vio (texto, enlaces, archivos seguros y una nota de hasta 200 palabras) a POST /api/verificador
// y muestra el reporte de SEÑALES (nunca garantías). Si la búsqueda se parece a una anterior, pregunta si continuar.
// Los costos nunca se muestran aquí: el servidor no los envía.
// ============================================================
(function () {
  const cfg = window.SITE_CONFIG || {};
  const API_URL = cfg.apiUrl || 'http://localhost:3000';
  const MAX_PALABRAS = 200;
  const MAX_ARCHIVOS = 4;
  const MAX_BYTES = 2 * 1024 * 1024;
  const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'];
  const NIVELES = {
    senales_favorables: ['Señales favorables', 'ver-ok'],
    senales_mixtas: ['Señales mixtas', 'ver-mix'],
    senales_de_alerta: ['Señales de alerta', 'ver-alerta'],
    informacion_insuficiente: ['Información insuficiente', 'ver-poca'],
  };
  const SECCIONES = [
    ['puntos_a_favor', 'Puntos a favor'], ['puntos_en_contra', 'Puntos en contra'], ['detalles_raros', 'Detalles raros'],
    ['que_evitar', 'Qué evitar'], ['que_hacer', 'Qué hacer antes de pagar'],
  ];
  let supabase = null;
  let archivos = [];
  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('DOMContentLoaded', cargarVideoInstruccional);

  // Espacio del video instruccional: muestra el más reciente publicado en Contenidos > sección «Verificador». Si no hay, se queda el aviso.
  async function cargarVideoInstruccional() {
    const caja = $('ver-video-caja');
    if (!caja) return;
    try {
      const res = await fetch(API_URL + '/api/contenidos?seccion=verificador');
      const data = await res.json();
      const v = res.ok && (data.contenidos || []).find((c) => c.url_media && /^https:\/\//.test(c.url_media));
      if (!v) return;
      caja.textContent = '';
      const marco = document.createElement('div');
      marco.className = 'video-embed';
      const f = document.createElement('iframe');
      f.src = v.url_media; f.title = v.titulo; f.loading = 'lazy'; f.allowFullscreen = true;
      f.setAttribute('allow', 'encrypted-media; picture-in-picture');
      marco.appendChild(f);
      const p = document.createElement('p');
      p.className = 'admin-hint';
      p.textContent = v.subtitulo_resumen || '';
      caja.append(marco, p);
    } catch (e) { /* sin red o sin video: se queda el aviso */ }
  }

  function esperarSupabase(ms = 1500) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      (function ver() {
        if (window.supabase) return resolve(window.supabase);
        if (Date.now() - t0 >= ms) return resolve(null);
        setTimeout(ver, 50);
      })();
    });
  }

  async function token() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session ? session.access_token : null;
  }

  async function api(path, opciones) {
    const t = await token();
    const headers = { 'Content-Type': 'application/json' };
    if (t) headers.Authorization = 'Bearer ' + t;
    const res = await fetch(API_URL + path, Object.assign({}, opciones, { headers }));
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  const palabras = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

  function texto(el, valor) { el.textContent = valor; return el; }
  function crear(tag, clase, valor) {
    const el = document.createElement(tag);
    if (clase) el.className = clase;
    if (valor != null) el.textContent = valor;
    return el;
  }

  async function init() {
    supabase = await esperarSupabase();
    const t = await token();
    $('ver-login').hidden = !!t;
    $('ver-app').hidden = !t;
    if (!t) return;
    $('ver-nota').addEventListener('input', contarNota);
    $('ver-archivos').addEventListener('change', elegirArchivos);
    $('ver-form').addEventListener('submit', (e) => { e.preventDefault(); preguntarOracle(); });
    $('ver-oracle-si').addEventListener('click', () => { $('ver-oracle-confirma').hidden = true; enviar(false); });
    $('ver-oracle-ajustar').addEventListener('click', () => { $('ver-oracle-confirma').hidden = true; $('ver-texto').focus(); });
    $('ver-continuar').addEventListener('click', () => enviar(true));
    $('ver-ver-anterior').addEventListener('click', () => { const id = $('ver-ver-anterior').dataset.id; if (id) mostrarGuardado(id); });
    iniciarGuia();
    contarNota();
    cargarSaldo();
    cargarReportes();
  }

  // ── Guía interactiva (4 pasos). Se abre sola la primera vez; después con el botón «Ver la guía».
  const CLAVE_GUIA = 'sqpr-verificador-guia';
  const EJEMPLO = {
    nivel: 'senales_mixtas',
    resumen: 'EJEMPLO FICTICIO. Un anuncio de un auto usado con precio por debajo del mercado, fotos que parecen de otro vehículo y pedido de un depósito antes de verlo. Hay señales que preocupan y otras favorables; falta información para opinar con más certeza.',
    puntos_a_favor: ['El anuncio incluye año, modelo y ciudad.', 'El vendedor respondió con rapidez y con datos concretos.'],
    puntos_en_contra: ['El precio está muy por debajo de autos parecidos.', 'Pide un depósito por adelantado antes de mostrar el vehículo.'],
    detalles_raros: ['Dos de las fotos tienen estilos distintos (podrían ser de otro auto).', 'El perfil que publica es muy reciente.'],
    que_evitar: ['Pagar o enviar dinero antes de ver el vehículo y el título.', 'Aceptar pagos por canales sin protección.'],
    que_hacer: ['Pedir ver el auto en persona, en un lugar público y con compañía.', 'Verificar el título y el marbete antes de pagar.', 'Hacer una búsqueda inversa de las fotos.'],
    fuentes: [],
    aviso: 'Este reporte es solo un EJEMPLO ficticio para practicar. Un reporte real describe señales y no garantiza ni asegura nada; no es asesoría legal.',
  };
  let pasoGuia = 1;

  function pintarPaso() {
    document.querySelectorAll('.ver-paso').forEach((el) => { el.hidden = Number(el.dataset.paso) !== pasoGuia; });
    $('ver-guia-n').textContent = 'Paso ' + pasoGuia + ' de 4';
    $('ver-guia-ant').disabled = pasoGuia === 1;
    $('ver-guia-sig').textContent = pasoGuia === 4 ? 'Terminar' : 'Siguiente';
  }

  function abrirGuia() { pasoGuia = 1; $('ver-guia').hidden = false; $('ver-guia-abrir').hidden = true; pintarPaso(); $('ver-guia').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function cerrarGuia() {
    $('ver-guia').hidden = true;
    $('ver-guia-abrir').hidden = false;
    try { localStorage.setItem(CLAVE_GUIA, '1'); } catch (e) { /* sin almacenamiento: la guía volverá a salir, no pasa nada */ }
  }

  function iniciarGuia() {
    $('ver-guia-abrir').addEventListener('click', abrirGuia);
    $('ver-guia-cerrar').addEventListener('click', cerrarGuia);
    $('ver-guia-reiniciar').addEventListener('click', () => { pasoGuia = 1; pintarPaso(); });
    $('ver-guia-ant').addEventListener('click', () => { if (pasoGuia > 1) { pasoGuia -= 1; pintarPaso(); } });
    $('ver-guia-sig').addEventListener('click', () => { if (pasoGuia < 4) { pasoGuia += 1; pintarPaso(); } else cerrarGuia(); });
    $('ver-guia-ejemplo').addEventListener('click', () => mostrarReporte(EJEMPLO, true));
    let vista = false;
    try { vista = localStorage.getItem(CLAVE_GUIA) === '1'; } catch (e) { vista = false; }
    if (!vista) abrirGuia();
  }

  function contarNota() {
    const n = palabras($('ver-nota').value);
    const c = $('ver-contador');
    c.textContent = n + ' de ' + MAX_PALABRAS + ' palabras';
    c.classList.toggle('ver-exceso', n > MAX_PALABRAS);
  }

  function elegirArchivos(e) {
    const estado = $('ver-estado');
    estado.textContent = '';
    for (const f of Array.from(e.target.files)) {
      if (archivos.length >= MAX_ARCHIVOS) { estado.textContent = 'Máximo ' + MAX_ARCHIVOS + ' archivos.'; break; }
      if (!TIPOS.includes(f.type)) { estado.textContent = 'No se aceptó "' + f.name + '": usa JPG, PNG, WEBP, GIF, PDF o texto (.txt).'; continue; }
      if (f.size > MAX_BYTES) { estado.textContent = '"' + f.name + '" pesa más de 2 MB.'; continue; }
      archivos.push(f);
    }
    e.target.value = '';
    pintarArchivos();
  }

  function pintarArchivos() {
    const ul = $('ver-lista-archivos');
    ul.textContent = '';
    archivos.forEach((f, i) => {
      const li = crear('li', null, f.name + ' ');
      const b = crear('button', 'btn btn-alt ver-quitar', 'Quitar');
      b.type = 'button';
      b.addEventListener('click', () => { archivos.splice(i, 1); pintarArchivos(); });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function aBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      r.readAsDataURL(file);
    });
  }

  async function cargarSaldo() {
    const r = await api('/api/verificador/saldo');
    const el = $('ver-saldo');
    if (!r.ok) { el.textContent = ''; return; }
    const n = r.data.usosDisponibles || 0;
    el.textContent = n === 1 ? 'Tienes 1 uso disponible.' : 'Tienes ' + n + ' usos disponibles.';
  }

  // Primer paso: The Oracle dice qué entendió y la persona lo confirma o lo ajusta ANTES de gastar un uso.
  // Si The Oracle no responde, no se bloquea nada: se sigue directo al reporte.
  async function preguntarOracle() {
    const estado = $('ver-estado');
    const boton = $('ver-enviar');
    $('ver-similar').hidden = true;
    $('ver-oracle-confirma').hidden = true;
    const nota = $('ver-nota').value;
    if (palabras(nota) > MAX_PALABRAS) { estado.textContent = 'Tu nota tiene más de ' + MAX_PALABRAS + ' palabras. Resúmela un poco.'; return; }
    const urls = $('ver-urls').value.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    boton.disabled = true;
    estado.textContent = 'The Oracle está revisando tu pedido…';
    try {
      const archivosB64 = await Promise.all(archivos.map(async (f) => ({ media_type: f.type, data: await aBase64(f) })));
      const r = await api('/api/verificador/entender', { method: 'POST', body: JSON.stringify({ texto: $('ver-texto').value, urls, preocupacion: nota, archivos: archivosB64 }) });
      if (!r.ok) {
        if (r.status === 400) { estado.textContent = r.data.error || 'Revisa tu pedido.'; return; }
        estado.textContent = '';
        boton.disabled = false;
        enviar(false);
        return;
      }
      estado.textContent = '';
      $('ver-oracle-resumen').textContent = r.data.resumen || '';
      const ul = $('ver-oracle-faltan');
      ul.textContent = '';
      (r.data.faltan || []).forEach((t) => ul.appendChild(crear('li', null, 'Podría ayudar: ' + t)));
      $('ver-oracle-si').hidden = r.data.tipo !== 'verificar_oferta';
      $('ver-oracle-confirma').hidden = false;
    } catch (err) {
      estado.textContent = err.message || 'Ocurrió un error. Intenta de nuevo.';
    } finally {
      boton.disabled = false;
    }
  }

  async function enviar(continuar) {
    const estado = $('ver-estado');
    const boton = $('ver-enviar');
    $('ver-similar').hidden = true;
    const nota = $('ver-nota').value;
    if (palabras(nota) > MAX_PALABRAS) { estado.textContent = 'Tu nota tiene más de ' + MAX_PALABRAS + ' palabras. Resúmela un poco.'; return; }
    const urls = $('ver-urls').value.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    const cuerpo = { texto: $('ver-texto').value, urls, preocupacion: nota, continuar: continuar === true };
    boton.disabled = true;
    estado.textContent = 'Revisando… puede tardar un minuto.';
    try {
      cuerpo.archivos = await Promise.all(archivos.map(async (f) => ({ media_type: f.type, data: await aBase64(f) })));
      const r = await api('/api/verificador', { method: 'POST', body: JSON.stringify(cuerpo) });
      if (r.status === 409 && r.data.similar) {
        estado.textContent = '';
        $('ver-similar-fecha').textContent = new Date(r.data.similar.creado_en).toLocaleDateString('es-PR');
        $('ver-ver-anterior').dataset.id = r.data.similar.id;
        $('ver-similar').hidden = false;
        return;
      }
      if (!r.ok) { estado.textContent = r.data.error || 'No se pudo completar el reporte.'; return; }
      estado.textContent = '';
      mostrarReporte(r.data.reporte);
      cargarSaldo();
      cargarReportes();
    } catch (err) {
      estado.textContent = err.message || 'Ocurrió un error. Intenta de nuevo.';
    } finally {
      boton.disabled = false;
    }
  }

  // Todo se pinta con textContent: lo que escribe la IA nunca se interpreta como HTML.
  function mostrarReporte(rep, esEjemplo) {
    const cont = $('ver-reporte');
    cont.textContent = '';
    if (esEjemplo) cont.appendChild(crear('p', 'ver-ejemplo', 'EJEMPLO: este reporte es ficticio y no gastó ningún uso.'));
    const nivel = NIVELES[rep.nivel] || NIVELES.informacion_insuficiente;
    cont.appendChild(crear('h3', 'ver-nivel ' + nivel[1], nivel[0]));
    cont.appendChild(crear('p', null, rep.resumen));
    SECCIONES.forEach(([clave, titulo]) => {
      const items = rep[clave] || [];
      if (!items.length) return;
      cont.appendChild(crear('h4', null, titulo));
      const ul = crear('ul');
      items.forEach((t) => ul.appendChild(crear('li', null, t)));
      cont.appendChild(ul);
    });
    if ((rep.fuentes || []).length) {
      cont.appendChild(crear('h4', null, 'Fuentes consultadas'));
      const ul = crear('ul');
      rep.fuentes.forEach((f) => {
        const li = crear('li');
        const a = crear('a', null, f.url);
        a.href = f.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        li.appendChild(a);
        li.appendChild(document.createTextNode(' — ' + f.nota));
        ul.appendChild(li);
      });
      cont.appendChild(ul);
    }
    cont.appendChild(crear('p', 'ver-aviso', rep.aviso));
    const acciones = crear('div', 'ver-acciones');
    const imp = crear('button', 'btn', 'Imprimir o guardar como PDF');
    imp.type = 'button';
    imp.addEventListener('click', () => window.print());
    const desc = crear('button', 'btn btn-alt', 'Descargar (.txt)');
    desc.type = 'button';
    desc.addEventListener('click', () => descargar(rep));
    acciones.appendChild(imp); acciones.appendChild(desc);
    cont.appendChild(acciones);
    cont.hidden = false;
    cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function descargar(rep) {
    const lineas = ['REPORTE DEL VERIFICADOR DE CONFIANZA — Sabías que PR', '', (NIVELES[rep.nivel] || NIVELES.informacion_insuficiente)[0], rep.resumen, ''];
    SECCIONES.forEach(([k, t]) => { if ((rep[k] || []).length) { lineas.push(t.toUpperCase()); rep[k].forEach((x) => lineas.push('- ' + x)); lineas.push(''); } });
    (rep.fuentes || []).forEach((f) => lineas.push('Fuente: ' + f.url + ' — ' + f.nota));
    lineas.push('', rep.aviso);
    const url = URL.createObjectURL(new Blob([lineas.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'reporte-verificador.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let guardados = [];
  function mostrarGuardado(id) {
    const r = guardados.find((x) => x.id === id);
    if (r) mostrarReporte(r.resultado);
    else cargarReportes().then(() => { const x = guardados.find((y) => y.id === id); if (x) mostrarReporte(x.resultado); });
  }

  async function cargarReportes() {
    const r = await api('/api/verificador/reportes');
    const ul = $('ver-historial');
    ul.textContent = '';
    if (!r.ok) return;
    guardados = r.data.reportes || [];
    $('ver-historial-vacio').hidden = guardados.length > 0;
    guardados.forEach((g) => {
      const li = crear('li');
      const b = crear('button', 'btn btn-alt', new Date(g.creado_en).toLocaleDateString('es-PR') + ' — ' + ((NIVELES[g.resultado.nivel] || NIVELES.informacion_insuficiente)[0]));
      b.type = 'button';
      b.addEventListener('click', () => mostrarReporte(g.resultado));
      li.appendChild(b);
      ul.appendChild(li);
    });
  }
})();
