// ============================================================
// admin.js — Sabías que PR · Panel de administración
// ============================================================
// Página protegida: solo usuarios con rol "admin" (tabla perfiles)
// pueden ver el panel. Verifica sesión con Supabase y rol con
// GET /api/me, luego hace CRUD sobre /api/contenidos y /api/productos.
// ============================================================

(function () {
  const cfg = window.SITE_CONFIG || {};
  const API_URL = cfg.apiUrl || 'http://localhost:3000';
  const isSupabaseConfigured = cfg.supabaseUrl && !cfg.supabaseUrl.includes('YOUR_SUPABASE');
  let supabase = null;
  let currentUser = null;

  let productosCache = [];
  let contenidosCache = [];

  document.addEventListener('DOMContentLoaded', init);

  // Igual que en foro.js: espera a que auth.js termine de inicializar
  // su propio cliente de Supabase para reutilizarlo (una sola sesión).
  function waitForSharedSupabase(timeoutMs = 1500, intervalMs = 50) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function check() {
        if (window.supabase) return resolve(window.supabase);
        if (Date.now() - start >= timeoutMs) return resolve(null);
        setTimeout(check, intervalMs);
      })();
    });
  }

  async function init() {
    if (!isSupabaseConfigured) {
      showGate('⚠️ La autenticación no está configurada en este sitio.');
      return;
    }
    try {
      const shared = await waitForSharedSupabase();
      supabase = shared || (await (async () => {
        const { createClient } = await import('./vendor/supabase-js.js');
        return createClient(cfg.supabaseUrl, cfg.supabaseKey);
      })());
      const { data: { session } } = await supabase.auth.getSession();
      currentUser = session?.user ?? null;
      // Si se cierra sesion (aqui o en otra pestana) mientras el panel esta
      // abierto, hay que volver a tapar el contenido -- init() solo corre
      // una vez al cargar la pagina, sin esto el admin-panel se queda
      // visible en el DOM (con datos ya cargados) despues del logout.
      // Al reves tambien: si se inicia sesion (o se cambia de cuenta) estando ya
      // en esta pagina, la compuerta se evaluaba solo al cargar y se quedaba en
      // "Inicia sesion" aunque el encabezado ya mostrara la cuenta. Solo se
      // recarga cuando NO habia sesion al cargar (`currentUser` nulo): supabase-js
      // vuelve a emitir SIGNED_IN cada vez que la pestana recupera el foco, y
      // recargar con el panel abierto haria perder lo que se esta editando.
      supabase.auth.onAuthStateChange((evento, sesionActual) => {
        if (!sesionActual) cerrarPanelPorLogout();
        else if (!currentUser && (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED')) location.reload();
      });
    } catch (err) {
      showGate('⚠️ No se pudo verificar tu sesión: ' + err.message);
      return;
    }

    if (!currentUser) {
      showGate('<a href="#" class="login-modal-trigger">Inicia sesión</a> para acceder al panel de administración.');
      return;
    }

    let rol;
    try {
      const data = await apiFetch('/api/me');
      rol = data.user.rol;
      if (!['admin', 'moderador'].includes(rol)) {
        showGate('⛔ Tu cuenta no tiene permisos de administrador ni de moderador.');
        return;
      }
      // Verificacion en dos pasos (AUDITORIA-SEGURIDAD.md, debilidad #2): el
      // servidor ya degrada el poder de esta sesion mientras no sea aal2, asi
      // que aqui solo se le pide al admin inscribir o ingresar su codigo.
      if (data.mfaPendiente) {
        await pasoMfa();
        return;
      }
    } catch (err) {
      showGate('⚠️ ' + err.message);
      return;
    }

    document.getElementById('admin-gate').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    bindTabs();
    bindAyuda();

    if (rol === 'admin') {
      bindContenidos();
      bindProductos();
      bindTraducciones();
      if (window.sqprCorreccionUI) window.sqprCorreccionUI.iniciar({ apiFetch });
      bindUrlNormalizer();
      loadContenidos();
      loadProductos();
    } else {
      // La moderación no se hace en este sitio: una cuenta de moderador no tiene pantallas aquí.
      document.getElementById('admin-panel').style.display = 'none';
      document.getElementById('admin-gate').style.display = 'block';
      showGate('Este panel es solo para administración.');
    }
  }

  // Los campos type="url" exigen un esquema completo (https://...) para que
  // el navegador deje enviar el formulario. En vez de que el admin tenga que
  // recordar escribirlo siempre, al salir del campo se le agrega solo si
  // falta — así "sabiasquepr.com" se completa a "https://sabiasquepr.com".
  // Quita parametros de rastreo (utm_*, fbclid, gclid) y el fragmento
  // "#:~:text=" que Chrome/Gemini agregan al copiar un enlace resaltado --
  // no cambian el articulo, solo ensucian la cita y filtran de donde vino.
  function limpiarUrlDeRastreo(valor) {
    if (!valor) return valor;
    try {
      const u = new URL(valor);
      [...u.searchParams.keys()]
        .filter((k) => /^utm_/i.test(k) || ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(k.toLowerCase()))
        .forEach((k) => u.searchParams.delete(k));
      if (u.hash.startsWith('#:~:')) u.hash = '';
      return u.toString();
    } catch { return valor; }
  }

  function bindUrlNormalizer() {
    document.querySelectorAll('#admin-panel input[type="url"]').forEach((input) => {
      input.addEventListener('blur', () => {
        let v = input.value.trim();
        if (v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
        input.value = limpiarUrlDeRastreo(v);
        if (input.id === 'brigada-url-contenido') updateCitationPreview();
      });
    });
  }

  // ── VERIFICACION EN DOS PASOS (TOTP) ─────────────────────
  // Vive en la compuerta (no detras de /api/admin/*) a proposito: para poder
  // inscribir el autenticador por primera vez la sesion todavia es aal1, y esa
  // sesion no puede llamar rutas de admin. Todo el trabajo lo hace Supabase
  // Auth (supabase.auth.mfa.*); el servidor solo lee el claim `aal` del JWT.
  function elemento(tag, props = {}, hijos = []) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'texto') el.textContent = v;
      else if (k === 'clase') el.className = v;
      else el.setAttribute(k, v);
    });
    hijos.forEach((h) => el.appendChild(h));
    return el;
  }

  function pintarMfa(titulo, hijos) {
    const gate = document.getElementById('admin-gate');
    if (!gate) return;
    const panel = document.getElementById('admin-panel');
    if (panel) panel.style.display = 'none';
    gate.style.display = '';
    gate.replaceChildren(elemento('div', { clase: 'mfa-paso' }, [
      elemento('h2', { texto: titulo }),
      ...hijos,
    ]));
  }

  // INICIO codigo-automatico
  // El campo del codigo de 6 digitos: deja solo numeros (tambien al pegar) y avisa cuando ya estan los 6,
  // para verificar sin pulsar el boton, como hace Supabase.
  function soloDigitos(valor) {
    return String(valor).replace(/\D/g, '').slice(0, 6);
  }
  function codigoCompleto(valor) {
    return /^\d{6}$/.test(valor);
  }
  // FIN codigo-automatico

  function formularioCodigo(alEnviar) {
    const estado = elemento('p', { clase: 'form-status', role: 'status', 'aria-live': 'polite' });
    const input = elemento('input', {
      type: 'text', id: 'mfa-codigo', inputmode: 'numeric', autocomplete: 'one-time-code',
      maxlength: '6', pattern: '[0-9]{6}', placeholder: '000000', 'aria-label': 'Código de 6 dígitos',
    });
    const boton = elemento('button', { type: 'submit', texto: 'Verificar' });
    const form = elemento('form', { clase: 'mfa-form' }, [input, boton]);
    input.addEventListener('input', () => {
      input.value = soloDigitos(input.value);
      if (codigoCompleto(input.value) && !boton.disabled) form.requestSubmit();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const codigo = input.value.replace(/\s+/g, '');
      if (!/^\d{6}$/.test(codigo)) {
        estado.textContent = 'Escribe los 6 dígitos que muestra tu app.';
        estado.className = 'form-status error';
        return;
      }
      boton.disabled = true;
      estado.textContent = 'Verificando...';
      estado.className = 'form-status info';
      try {
        await alEnviar(codigo);
        estado.textContent = 'Verificado. Abriendo el panel...';
        estado.className = 'form-status ok';
        location.reload();
      } catch (err) {
        estado.textContent = 'No se pudo verificar: ' + (window.sqprErrorAuth ? window.sqprErrorAuth(err) : err.message);
        estado.className = 'form-status error';
        input.value = '';
        input.focus();
        boton.disabled = false;
      }
    });
    form.appendChild(estado);
    return { form, estado, input };
  }

  async function verificarCodigo(factorId, codigo) {
    const { data: reto, error: e1 } = await supabase.auth.mfa.challenge({ factorId });
    if (e1) throw e1;
    const { error: e2 } = await supabase.auth.mfa.verify({ factorId, challengeId: reto.id, code: codigo });
    if (e2) throw e2;
  }

  function botonCerrarSesion() {
    const b = elemento('button', { type: 'button', clase: 'mfa-salir', texto: 'Cerrar sesión' });
    b.addEventListener('click', () => supabase.auth.signOut());
    return b;
  }

  async function pasoMfa() {
    const { data: lista, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      showGate('⚠️ No se pudo consultar la verificación en dos pasos: ' + error.message);
      return;
    }
    // `totp` solo trae los factores ya verificados.
    const verificado = (lista?.totp || [])[0];
    if (verificado) {
      const { form, input } = formularioCodigo((codigo) => verificarCodigo(verificado.id, codigo));
      pintarMfa('Verificación en dos pasos', [
        elemento('p', { texto: 'Escribe el código de 6 dígitos que muestra tu app de autenticación.' }),
        form,
        botonCerrarSesion(),
      ]);
      input.focus();
      return;
    }
    await inscribirMfa(lista);
  }

  async function inscribirMfa(lista) {
    // Una inscripcion abandonada (QR creado pero nunca confirmado) bloquea
    // crear otra con el mismo nombre -- se limpian antes de empezar de nuevo.
    const pendientes = (lista?.all || []).filter((f) => f.factor_type === 'totp' && f.status !== 'verified');
    for (const f of pendientes) await supabase.auth.mfa.unenroll({ factorId: f.id });

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Sabías que PR · admin · ' + new Date().toISOString().slice(0, 10) + ' ' + Math.random().toString(36).slice(2, 6),
    });
    if (error) {
      showGate('⚠️ No se pudo iniciar la verificación en dos pasos: ' + error.message);
      return;
    }
    const factorId = data.id;
    const qr = elemento('img', { alt: 'Código QR para tu app de autenticación', width: '200', height: '200', clase: 'mfa-qr' });
    qr.src = data.totp.qr_code;
    const { form, input } = formularioCodigo((codigo) => verificarCodigo(factorId, codigo));
    pintarMfa('Activa la verificación en dos pasos', [
      elemento('p', { texto: 'Tu cuenta tiene permisos de administración, así que necesita un segundo paso al entrar.' }),
      elemento('ol', { clase: 'mfa-pasos' }, [
        elemento('li', { texto: 'Abre una app de autenticación (Google Authenticator, Microsoft Authenticator, Authy, 1Password...).' }),
        elemento('li', { texto: 'Escanea este código QR.' }),
        elemento('li', { texto: 'Escribe aquí el código de 6 dígitos que te muestra.' }),
      ]),
      qr,
      elemento('p', { clase: 'mfa-secreto' }, [
        elemento('span', { texto: 'Si no puedes escanear, escribe esta clave a mano: ' }),
        elemento('code', { texto: data.totp.secret }),
      ]),
      elemento('p', { clase: 'mfa-aviso', texto: 'Guarda esa clave en tu gestor de contraseñas: es la única forma de recuperar el acceso si pierdes el teléfono.' }),
      form,
      botonCerrarSesion(),
    ]);
    input.focus();
  }

  function showGate(msg) {
    const el = document.getElementById('admin-gate');
    if (el) el.innerHTML = `<p>${msg}</p>`;
  }

  // Vuelve a tapar el panel cuando la sesion desaparece (logout, token
  // expirado, o sesion cerrada en otra pestana). Limpia las listas ya
  // cargadas -- no basta con ocultar el div, los datos de admin no deben
  // quedarse en el DOM despues de cerrar sesion.
  function cerrarPanelPorLogout() {
    currentUser = null;
    document.getElementById('admin-panel').style.display = 'none';
    const gate = document.getElementById('admin-gate');
    if (gate) gate.style.display = '';
    showGate('<a href="#" class="login-modal-trigger">Inicia sesión</a> para acceder al panel de administración.');
    ['admin-contenidos-list', 'admin-productos-list'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    productosCache = [];
    contenidosCache = [];
  }

  async function getToken() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  async function apiFetch(path, options = {}) {
    const token = await getToken();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API_URL + path, Object.assign({}, options, { headers }));
    const data = await res.json().catch(() => ({}));
    if (data.code === 'mfa_required') { pasoMfa(); throw new Error(data.error); }
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  // ── PESTAÑAS ─────────────────────────────────────────────
  function activarTab(tab) {
    document.querySelectorAll('.admin-tabs .foro-filter-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('admin-panel-contenidos').style.display = tab === 'contenidos' ? '' : 'none';
    document.getElementById('admin-panel-productos').style.display = tab === 'productos' ? '' : 'none';
  }

  function bindTabs() {
    document.querySelectorAll('.admin-tabs .foro-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => activarTab(btn.dataset.tab));
    });
  }

  // ── TRADUCCIONES (Fase C2) ───────────────────────────────
  // Cada formulario (noticia, contenido, producto) tiene debajo una caja para
  // la version en el otro idioma: el admin la escribe y la guarda con "Guardar
  // traducción". Los campos son solo los de texto; precios, enlaces y
  // clasificaciones no se traducen (son los mismos en ambos idiomas).
  const TRADUCCION_CFG = {
    contenido: {
      idInput: 'ac-id', origenSelect: 'ac-idioma-original',
      campos: [
        { nombre: 'titulo', etiqueta: 'Título', control: 'input', origen: 'ac-titulo' },
        { nombre: 'subtitulo_resumen', etiqueta: 'Resumen / subtítulo', control: 'textarea', origen: 'ac-subtitulo' },
        { nombre: 'cuerpo', etiqueta: 'Cuerpo', control: 'textarea-grande', origen: 'ac-cuerpo' },
        { nombre: 'portada_alt', etiqueta: 'Texto alternativo de la portada', control: 'input', origen: 'ac-portada-alt' },
      ],
    },
    producto: {
      idInput: 'ap-id', origenSelect: null, // los productos se escriben siempre en español
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre', control: 'input', origen: 'ap-nombre' },
        { nombre: 'descripcion', etiqueta: 'Descripción', control: 'textarea', origen: 'ap-descripcion' },
        { nombre: 'imagen_alt', etiqueta: 'Texto alternativo de la imagen', control: 'input', origen: 'ap-imagen-alt' },
      ],
    },
  };
  const IDIOMA_NOMBRE = { es: 'español', en: 'inglés' };

  function idiomaOrigenDe(tipo) {
    const sel = TRADUCCION_CFG[tipo].origenSelect;
    return (sel && document.getElementById(sel).value) === 'en' ? 'en' : 'es';
  }
  function idiomaDestinoDe(tipo) { return idiomaOrigenDe(tipo) === 'es' ? 'en' : 'es'; }
  function idPiezaDe(tipo) { return document.getElementById(TRADUCCION_CFG[tipo].idInput).value; }

  function separarLineas(valor) {
    return valor.split('\n').map((p) => p.trim()).filter(Boolean);
  }
  function leerCampoOrigen(campo) {
    const valor = document.getElementById(campo.origen).value;
    return campo.control === 'lista' ? separarLineas(valor) : valor.trim();
  }
  function leerCampoTraduccion(tipo, campo) {
    const valor = document.getElementById(`tr-${tipo}-${campo.nombre}`).value;
    return campo.control === 'lista' ? separarLineas(valor) : valor.trim();
  }
  function escribirCampoTraduccion(tipo, campo, valor) {
    const el = document.getElementById(`tr-${tipo}-${campo.nombre}`);
    el.value = Array.isArray(valor) ? valor.join('\n') : (valor || '');
  }

  function renderPanelTraduccion(tipo) {
    const cfg = TRADUCCION_CFG[tipo];
    const box = document.getElementById(`tr-${tipo}`);
    const campos = cfg.campos.map((c) => {
      const id = `tr-${tipo}-${c.nombre}`;
      const filas = c.control === 'textarea-grande' ? 10 : (c.control === 'input' ? 0 : 4);
      const control = filas
        ? `<textarea id="${id}" rows="${filas}" spellcheck="true"></textarea>`
        : `<input type="text" id="${id}" spellcheck="true">`;
      return `<div class="tr-par">
        <div class="tr-orig"><span class="tr-orig-etiqueta">Original (<span id="tr-${tipo}-${c.nombre}-idioma">español</span>) — ${c.etiqueta}</span><div class="tr-orig-texto" id="tr-${tipo}-${c.nombre}-orig"></div></div>
        <div class="tr-dest"><label for="${id}">${c.etiqueta} <span class="tr-dest-idioma"></span></label>${control}</div>
      </div>`;
    }).join('');
    box.innerHTML = `
      <details class="tr-details" id="tr-${tipo}-details">
        <summary class="tr-summary">
          <span class="tr-summary-title">Traducción al <span id="tr-${tipo}-destino"></span></span>
          <span class="tr-chip" id="tr-${tipo}-chip">Opcional</span>
        </summary>
        <div class="tr-body">
          <p class="admin-hint" id="tr-${tipo}-estado"></p>
          <div id="tr-${tipo}-campos">${campos}</div>
          <div class="tr-acciones" id="tr-${tipo}-acciones">
            <button type="button" class="admin-btn-new" id="tr-${tipo}-guardar">Guardar traducción</button>
            <button type="button" class="tr-enlace-peligro" id="tr-${tipo}-borrar">Eliminar traducción</button>
          </div>
          <p class="form-status" id="tr-${tipo}-status" aria-live="polite"></p>
        </div>
      </details>`;
    document.getElementById(`tr-${tipo}-campos`).addEventListener('input', () => {
      traduccionSinGuardar[tipo] = true;
      marcarChipTraduccion(tipo, 'Sin guardar', 'pend');
    });
    box.hidden = false;
    document.getElementById(`tr-${tipo}-details`).addEventListener('toggle', () => mostrarOriginales(tipo));
    document.getElementById(`tr-${tipo}-guardar`).addEventListener('click', () => guardarTraduccion(tipo));
    document.getElementById(`tr-${tipo}-borrar`).addEventListener('click', () => borrarTraduccion(tipo));
    if (cfg.origenSelect) {
      document.getElementById(cfg.origenSelect).addEventListener('change', () => refrescarPanelTraduccion(tipo));
    }
  }

  // Muestra, junto a cada campo traducido, el texto original del formulario para poder compararlos.
  function mostrarOriginales(tipo) {
    const cfg = TRADUCCION_CFG[tipo];
    const origen = IDIOMA_NOMBRE[idiomaOrigenDe(tipo)];
    const destino = IDIOMA_NOMBRE[idiomaDestinoDe(tipo)];
    cfg.campos.forEach((c) => {
      const caja = document.getElementById(`tr-${tipo}-${c.nombre}-orig`);
      if (!caja) return;
      const v = leerCampoOrigen(c);
      caja.textContent = Array.isArray(v) ? v.join('\n') : v;
      if (!caja.textContent) caja.textContent = '(vacío)';
      document.getElementById(`tr-${tipo}-${c.nombre}-idioma`).textContent = origen;
      const lab = document.querySelector(`label[for="tr-${tipo}-${c.nombre}"] .tr-dest-idioma`);
      if (lab) lab.textContent = `(${destino})`;
    });
  }

  function bindTraducciones() {
    Object.keys(TRADUCCION_CFG).forEach(renderPanelTraduccion);
  }

  // Se llama al abrir cada formulario: muestra la traduccion guardada (si hay)
  // o el aviso de que primero hay que guardar la pieza.
  function marcarChipTraduccion(tipo, texto, estado) {
    const chip = document.getElementById(`tr-${tipo}-chip`);
    chip.textContent = texto;
    chip.className = `tr-chip tr-chip-${estado}`;
    const caja = document.getElementById(`tr-${tipo}-estado`);
    if (caja) caja.className = `admin-hint tr-estado tr-estado-${estado}`;
  }

  async function refrescarPanelTraduccion(tipo) {
    if (!document.getElementById(`tr-${tipo}-campos`)) return; // moderador: no se montan
    const cfg = TRADUCCION_CFG[tipo];
    const id = idPiezaDe(tipo);
    const destino = idiomaDestinoDe(tipo);
    const origenNombre = IDIOMA_NOMBRE[idiomaOrigenDe(tipo)];
    const estado = document.getElementById(`tr-${tipo}-estado`);
    document.getElementById(`tr-${tipo}-destino`).textContent = IDIOMA_NOMBRE[destino];
    traduccionSinGuardar[tipo] = false;
    setStatus(document.getElementById(`tr-${tipo}-status`), '', '');
    cfg.campos.forEach((c) => escribirCampoTraduccion(tipo, c, ''));
    mostrarOriginales(tipo);
    const usable = Boolean(id);
    document.getElementById(`tr-${tipo}-campos`).hidden = !usable;
    document.getElementById(`tr-${tipo}-acciones`).hidden = !usable;
    if (!usable) {
      marcarChipTraduccion(tipo, 'Guarda primero', 'off');
      estado.textContent = 'La traducción es opcional y se hace después de guardar la pieza: guárdala, ábrela con «Editar» y vuelve aquí.';
      return;
    }
    marcarChipTraduccion(tipo, 'Buscando…', 'off');
    estado.textContent = 'Buscando traducción guardada...';
    try {
      const data = await apiFetch(`/api/admin/traducciones/${tipo}/${encodeURIComponent(id)}`);
      if (id !== idPiezaDe(tipo)) return; // se abrió otra pieza mientras cargaba
      const guardada = data.traducciones && data.traducciones[destino];
      if (guardada) {
        cfg.campos.forEach((c) => escribirCampoTraduccion(tipo, c, guardada.campos[c.nombre]));
        marcarChipTraduccion(tipo, 'Guardada', 'ok');
        estado.textContent = `Traducción al ${IDIOMA_NOMBRE[destino]} guardada (${String(guardada.actualizadoEn).slice(0, 10)}). Los visitantes que elijan ese idioma la verán.`;
      } else {
        marcarChipTraduccion(tipo, 'Pendiente', 'pend');
        estado.textContent = `Sin traducción al ${IDIOMA_NOMBRE[destino]} todavía: los visitantes que elijan ese idioma verán la pieza en ${origenNombre} con la etiqueta "solo en ${origenNombre}".`;
      }
    } catch (err) {
      marcarChipTraduccion(tipo, 'Error', 'error');
      estado.textContent = 'No se pudo consultar la traducción: ' + err.message;
    }
  }

  async function guardarTraduccion(tipo) {
    const cfg = TRADUCCION_CFG[tipo];
    const statusEl = document.getElementById(`tr-${tipo}-status`);
    const id = idPiezaDe(tipo);
    const destino = idiomaDestinoDe(tipo);
    const campos = {};
    cfg.campos.forEach((c) => {
      const v = leerCampoTraduccion(tipo, c);
      if (Array.isArray(v) ? v.length : v) campos[c.nombre] = v;
    });
    setStatus(statusEl, 'info', 'Guardando traducción...');
    try {
      await apiFetch(`/api/admin/traducciones/${tipo}/${encodeURIComponent(id)}/${destino}`, { method: 'PUT', body: JSON.stringify({ campos }) });
      await refrescarPanelTraduccion(tipo);
      const hora = new Date().toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' });
      setStatus(statusEl, 'ok tr-status-grande', `✓ Traducción al ${IDIOMA_NOMBRE[destino]} guardada a las ${hora}. Ya la ven los visitantes que elijan ese idioma.`);
    } catch (err) {
      setStatus(statusEl, 'error tr-status-grande', '' + err.message);
    }
  }

  async function borrarTraduccion(tipo) {
    const statusEl = document.getElementById(`tr-${tipo}-status`);
    const destino = idiomaDestinoDe(tipo);
    if (!confirm(`¿Eliminar la traducción al ${IDIOMA_NOMBRE[destino]}? La pieza volverá a mostrarse solo en su idioma original.`)) return;
    try {
      await apiFetch(`/api/admin/traducciones/${tipo}/${encodeURIComponent(idPiezaDe(tipo))}/${destino}`, { method: 'DELETE' });
      await refrescarPanelTraduccion(tipo);
      setStatus(statusEl, 'ok tr-status-grande', '✓ Traducción eliminada. La pieza vuelve a mostrarse solo en su idioma original.');
    } catch (err) {
      setStatus(statusEl, 'error tr-status-grande', '' + err.message);
    }
  }

  // La lista de IA usadas y la divulgacion (No se uso / parcial / generado) se mantienen de acuerdo: marcar una IA pasa
  // "No se uso IA" a "parcial"; elegir "No se uso IA" vacia la lista y bloquea el selector.
  function montarSelectorIa(hostId, selectId) {
    const sel = document.getElementById(selectId);
    const selector = window.sqprIa.montarSelector(document.getElementById(hostId), {
      onChange: (lista) => { if (lista.length && sel.value === 'no') sel.value = 'parcial'; },
    });
    sel.addEventListener('change', () => {
      if (sel.value === 'no') selector.escribir([]);
      selector.habilitar(sel.value !== 'no');
    });
    return selector;
  }
  function cargarIaEnSelector(selector, selectId, lista) {
    selector.escribir(lista || []);
    selector.habilitar(document.getElementById(selectId).value !== 'no');
  }

  // Traducciones con cambios que todavia no se guardaron (por tipo de pieza): al guardar la pieza se guardan tambien.
  const traduccionSinGuardar = {};

  // INICIO guardado-continuo
  // Texto alternativo de una imagen: opcional; si queda vacio se usa el titulo para que la imagen nunca quede sin descripcion.
  function textoAlternativo(alt, titulo) {
    const limpio = String(alt || '').trim();
    return limpio || String(titulo || '').trim().slice(0, 160);
  }
  // Un borrador no puede ser la noticia "Destacada": destacar a un borrador le quitaba el destacado a la publicada.
  function destacadoPermitido(destacado, publicar) {
    return Boolean(destacado) && Boolean(publicar);
  }
  // FIN guardado-continuo

  // Despues de guardar una pieza el formulario SIGUE abierto con su id: asi la traduccion (que necesita el id) se puede
  // hacer enseguida, guardar de nuevo edita en vez de duplicar, y una traduccion sin guardar no se pierde. "Cancelar" pasa a "Cerrar".
  async function despuesDeGuardar(o) {
    document.getElementById(o.idInput).value = o.pieza.id;
    document.getElementById(o.tituloForm).textContent = o.tituloNuevo;
    document.getElementById(o.botonCerrar).textContent = 'Cerrar';
    o.recargarLista();
    let aviso = o.mensaje;
    if (traduccionSinGuardar[o.tipo]) {
      await guardarTraduccion(o.tipo);
      aviso += ' La traducción pendiente también se guardó.';
    } else {
      await refrescarPanelTraduccion(o.tipo);
    }
    setStatus(o.statusEl, 'ok', aviso);
  }

  // INICIO aviso-campo-faltante
  // Los formularios largos reparten sus campos obligatorios en paneles (pasos) ocultos: sin esto el navegador
  // bloquea el envio en silencio porque no puede enfocar un campo oculto. Al primer campo invalido se abre su
  // panel y se dice cual falta.
  function avisarCampoFaltante(form, activar, statusEl) {
    let atendido = false;
    form.addEventListener('invalid', (e) => {
      if (atendido) return;
      atendido = true;
      setTimeout(() => { atendido = false; }, 0);
      const panel = e.target.closest('[data-panel]');
      if (panel && panel.hidden) activar(panel.dataset.panel);
      const etiqueta = e.target.id ? form.querySelector(`label[for="${e.target.id}"]`) : null;
      const nombre = etiqueta ? etiqueta.textContent.replace(/\(.*?\)/g, '').trim() : 'un campo obligatorio';
      setStatus(statusEl, 'error', `Falta completar: ${nombre}.`);
    }, true);
  }
  // FIN aviso-campo-faltante

  // ── NOTICIAS ─────────────────────────────────────────────
  // ── FORMULARIO DE NOTICIAS: NIVELES NEWSROOM ─────────────
  // Mismo patron que activarSynthPanel/bindSynthPanels en Contenidos --
  // acordeon puramente visual, no cambia validacion ni envio del formulario.
  // ── OTRAS FUENTES de una pieza (Taller E4) ──────────────
  // La fuente principal sigue siendo la URL de la mesa; aqui se agregan hasta 4 fuentes mas ({ nombre, url }).
  // INICIO fuentes-extra
  const MAX_FUENTES_EXTRA = 4;
  function nombreDeUrl(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }
  // De las filas del formulario a la lista que se guarda: sin filas vacias y, si hay enlace pero no nombre, el nombre es el sitio.
  function limpiarFilasFuentes(filas) {
    return filas
      .map((f) => ({ url: String(f.url || '').trim(), nombre: String(f.nombre || '').trim() }))
      .filter((f) => f.url || f.nombre)
      .map((f) => ({ nombre: f.nombre || nombreDeUrl(f.url), url: f.url }))
      .filter((f) => f.nombre);
  }
  function htmlFilaFuente(f, esc) {
    return `<div class="fuente-extra-fila">
      <input type="url" class="fe-url" placeholder="https://... (déjalo vacío si es un libro)" value="${esc((f && f.url) || '')}" aria-label="Enlace de la otra fuente">
      <input type="text" class="fe-nombre" maxlength="200" placeholder="Nombre (opcional si hay enlace)" value="${esc((f && f.nombre) || '')}" aria-label="Nombre de la otra fuente">
      <button type="button" class="tr-enlace-peligro fe-quitar" aria-label="Quitar esta fuente">✕</button>
    </div>`;
  }
  // FIN fuentes-extra
  const filasFuentes = (clave) => [...document.querySelectorAll(`#fuentes-extra-lista-${clave} .fuente-extra-fila`)];
  function leerFuentesExtraDe(clave) {
    return limpiarFilasFuentes(filasFuentes(clave).map((fila) => ({ url: fila.querySelector('.fe-url').value, nombre: fila.querySelector('.fe-nombre').value })));
  }
  // Solo los enlaces (lo que pueden leer las agentes); los libros sin enlace no se leen.
  const urlsExtraDe = (clave) => leerFuentesExtraDe(clave).map((f) => f.url).filter(Boolean);
  function actualizarBotonFuentes(clave) {
    document.getElementById(`fuentes-extra-agregar-${clave}`).disabled = filasFuentes(clave).length >= MAX_FUENTES_EXTRA;
  }
  function pintarFuentesExtra(clave, fuentes) {
    document.getElementById(`fuentes-extra-lista-${clave}`).innerHTML = (Array.isArray(fuentes) ? fuentes : []).slice(0, MAX_FUENTES_EXTRA).map((f) => htmlFilaFuente(f, escapeHtml)).join('');
    actualizarBotonFuentes(clave);
  }
  function bindFuentesExtra(clave) {
    const lista = document.getElementById(`fuentes-extra-lista-${clave}`);
    document.getElementById(`fuentes-extra-agregar-${clave}`).addEventListener('click', () => {
      if (filasFuentes(clave).length >= MAX_FUENTES_EXTRA) return;
      lista.insertAdjacentHTML('beforeend', htmlFilaFuente({}, escapeHtml));
      actualizarBotonFuentes(clave);
      lista.lastElementChild.querySelector('.fe-url').focus();
    });
    lista.addEventListener('click', (e) => {
      const quitar = e.target.closest('.fe-quitar');
      if (!quitar) return;
      quitar.closest('.fuente-extra-fila').remove();
      actualizarBotonFuentes(clave);
    });
  }

  // ── CONTENIDOS (video/ensayo/noticia/lectura_corta) ──────
  // Casillas editoriales (en orden alfabético): id de la casilla → columna que devuelve la API.
  const CASILLAS_FORM = [['ac-actualizada', 'actualizada'], ['ac-fijada', 'fijada'], ['ac-sensible', 'sensible'], ['ac-ultima-hora', 'ultima_hora'], ['ac-verificada', 'verificada']];
  const SECCION_LABEL = { noticias: 'Noticias', 'revolucion-humana': 'Revolución Humana', educacion: 'Educación', verificador: 'Verificador' };
  const TIPO_LABEL = { video: 'Video', audio: 'Audio', foto: 'Foto', ensayo: 'Ensayo', noticia: 'Noticia', lectura_corta: 'Lectura corta' };
  const SUBSECCION_LABEL = { 'nuevos-humanos': 'Nuevos Humanos', 'revolucion-mundial': 'Revolución Mundial', 'logica-humana': 'Lógica Humana', 'corrupcion-humana': 'Corrupción Humana', 'ilogica-humana': 'Ilógica Humana' };
  // Orden alfabetico de las 4 secciones de Revolucion Humana (mismo criterio
  // usado en rh-subnav), mas Revolucion Mundial al final -- agrupa el acordeon
  // de la lista de Contenidos (ver renderContenidosList).
  const SUBSECCION_ORDEN = ['corrupcion-humana', 'ilogica-humana', 'logica-humana', 'nuevos-humanos', 'revolucion-mundial'];

  // ── "UN FORMULARIO, VARIAS PIELES" ────────────────────────
  // Nuevos Humanos, Corrupcion Humana y Logica Humana ya tienen tema propio
  // (Constelacion / paleta Newsroom / Kintsugi -- este ultimo inspirado en
  // la identidad de Aliado Imperfekto: grieta dorada, "el error se integra,
  // no se esconde"); Educacion tiene el suyo (Biblioteca). Revolucion
  // Mundial y cualquier categoria nueva se quedan en Synthwave (la paleta
  // original, el estandar por defecto). Mismo mapa lo usa el formulario
  // (data-tema en #admin-contenidos-form-box) y cada tarjeta de la lista
  // (.synth-item).
  const TEMA_POR_SUBSECCION = { 'nuevos-humanos': 'constelacion', 'corrupcion-humana': 'corrupcion', 'logica-humana': 'kintsugi' };
  function temaParaClasificacion(seccion, subseccion) {
    if (seccion === 'educacion') return 'biblioteca';
    if (seccion === 'revolucion-humana' && subseccion && TEMA_POR_SUBSECCION[subseccion]) return TEMA_POR_SUBSECCION[subseccion];
    return 'synthwave';
  }
  function actualizarTemaContenidos() {
    const seccion = document.getElementById('ac-seccion').value;
    const subseccion = document.getElementById('ac-subseccion').value;
    const tema = temaParaClasificacion(seccion, subseccion);
    const box = document.getElementById('admin-contenidos-form-box');
    if (tema === 'synthwave') box.removeAttribute('data-tema');
    else box.dataset.tema = tema;
  }

  // "Sub-sección" única del formulario: sus opciones cambian con la Sección (ver clasificacion.js).
  // Los campos ocultos ac-subseccion / ac-categoria son los que leen el envío y el Nivel 4 (IA).
  function llenarClasificacion(valorInicial) {
    const clasif = window.sqprClasificacion;
    const seccion = document.getElementById('ac-seccion').value;
    const sel = document.getElementById('ac-clasificacion');
    const etiquetas = new Map(JSON.parse(sel.dataset.opciones)[seccion]);
    const vacio = clasif.esObligatoria(seccion) ? 'Elige una sub-sección' : 'Ninguna';
    sel.innerHTML = '';
    sel.add(new Option(vacio, ''));
    for (const clave of clasif.clavesDe(seccion)) sel.add(new Option(etiquetas.get(clave), clave));
    sel.required = clasif.esObligatoria(seccion);
    sel.value = valorInicial || '';
    document.getElementById('ac-clasificacion-label').textContent = seccion === 'revolucion-humana'
      ? 'Sub-sección de Revolución Humana (opcional)'
      : (seccion === 'educacion' ? 'Sub-sección de Educación' : (seccion === 'verificador' ? 'Sub-sección (el Verificador no usa)' : 'Sub-sección de Noticias'));
  }
  function sincronizarClasificacion() {
    const seccion = document.getElementById('ac-seccion').value;
    const cat = document.getElementById('ac-categoria');
    const campos = window.sqprClasificacion.aCampos(
      seccion, document.getElementById('ac-clasificacion').value, categoriaGuardada
    );
    cat.value = campos.categoria;
    document.getElementById('ac-subseccion').value = campos.subseccion || '';
    actualizarTemaContenidos();
  }

  function bindContenidos() {
    document.getElementById('ac-seccion').addEventListener('change', () => {
      llenarClasificacion('');
      sincronizarClasificacion();
    });
    document.getElementById('ac-clasificacion').addEventListener('change', sincronizarClasificacion);
    document.getElementById('admin-contenidos-new').addEventListener('click', () => openContenidoForm());
    document.getElementById('ac-cancel').addEventListener('click', closeContenidoForm);
    document.getElementById('admin-contenidos-search').addEventListener('input', renderContenidosList);
    const formContenidos = document.getElementById('admin-contenidos-form');
    formContenidos.addEventListener('submit', submitContenido);
    avisarCampoFaltante(formContenidos, activarSynthPanel, document.getElementById('ac-status'));
    // Publicar o guardar borrador solo ocurre con estos dos botones (Enter no envia el formulario).
    const enviarContenido = (publicar) => {
      document.getElementById('ac-publicado').checked = publicar;
      const destacado = document.getElementById('ac-destacado');
      if (destacado.checked && !destacadoPermitido(true, publicar)) {
        destacado.checked = false;
        setStatus(document.getElementById('ac-status'), 'info', 'Se quitó «Destacado»: un borrador no puede ser el destacado de su sección.');
      }
      formContenidos.requestSubmit();
    };
    document.getElementById('ac-borrador').addEventListener('click', () => enviarContenido(false));
    document.getElementById('ac-guardar').addEventListener('click', () => enviarContenido(true));
    selectorIaContenido = montarSelectorIa('ac-ia-selector', 'ac-divulgacion-ia');
    bindFuentesExtra('contenido');
    document.getElementById('ac-usar-imagen-categoria').addEventListener('click', () => {
      const categoria = document.getElementById('ac-categoria').value;
      const img = window.SQPR && window.SQPR.CATEGORIA_IMAGEN && window.SQPR.CATEGORIA_IMAGEN[categoria];
      if (!img) {
        alert('Todavía no hay una imagen genérica para esta categoría.');
        return;
      }
      document.getElementById('ac-url-portada').value = img.src;
      document.getElementById('ac-portada-alt').value = img.alt;
      updateImagePreview('ac-url-portada', 'ac-url-portada-preview');
    });
    bindImagePicker('ac-url-portada', 'ac-url-portada-preview', 'ac-elegir-imagen');
    document.getElementById('ac-autocompletar-youtube').addEventListener('click', autocompletarYoutube);
    document.getElementById('ac-elegir-video-canal').addEventListener('click', abrirSelectorCanalYoutube);
    document.getElementById('youtube-picker-close').addEventListener('click', cerrarSelectorCanalYoutube);
    document.getElementById('youtube-picker-modal').addEventListener('click', (e) => {
      if (e.target.id === 'youtube-picker-modal') cerrarSelectorCanalYoutube();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('youtube-picker-modal').hidden) cerrarSelectorCanalYoutube();
    });

    document.getElementById('ac-cita-sin-fuente').addEventListener('change', () => { toggleCitationFields(); updateCitationPreview(); });
    ['ac-cita-estilo', 'ac-cita-autor', 'ac-cita-anio', 'ac-cita-titulo-original', 'ac-cita-fecha-acceso', 'ac-fuente-texto', 'brigada-url-contenido']
      .forEach((id) => document.getElementById(id).addEventListener('input', updateCitationPreview));

    document.getElementById('ac-cita-copiar').addEventListener('click', async () => {
      const estado = document.getElementById('ac-cita-copiar-estado');
      const texto = document.getElementById('ac-cita-preview').textContent.trim();
      if (!texto) { estado.textContent = 'Todavía no hay una cita: elige el estilo y llena los datos.'; return; }
      try { await navigator.clipboard.writeText(texto); estado.textContent = 'Cita copiada.'; } catch { estado.textContent = 'No se pudo copiar: selecciona el texto de la cita y cópialo a mano.'; }
    });

    bindSynthPanels();
  }

  // ── FORMULARIO DE CONTENIDOS: NIVELES SYNTHWAVE ──────────
  // Acordeon puramente visual -- reagrupa los mismos campos/ids de siempre
  // en 5 "niveles"; un panel abierto a la vez. No cambia validacion ni el
  // envio del formulario (submitContenido sigue leyendo los mismos ids).
  function activarSynthPanel(nombre) {
    document.querySelectorAll('#synth-levels .synth-level-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.panel === nombre);
    });
    document.querySelectorAll('.synth-panel').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== nombre;
    });
  }

  function bindSynthPanels() {
    document.querySelectorAll('#synth-levels .synth-level-card').forEach((card) => {
      card.addEventListener('click', () => activarSynthPanel(card.dataset.panel));
    });
  }

  let selectorIaContenido = null;
  // Categoría con la que se guardó la pieza que se está editando (Revolución Humana no la pregunta y la conserva).
  let categoriaGuardada = '';

  function toggleCitationFields() {
    const sinFuente = document.getElementById('ac-cita-sin-fuente').checked;
    ['ac-cita-estilo', 'ac-cita-autor', 'ac-cita-anio', 'ac-cita-titulo-original', 'ac-cita-fecha-acceso']
      .forEach((id) => { document.getElementById(id).disabled = sinFuente; });
  }

  function updateCitationPreview() {
    const preview = document.getElementById('ac-cita-preview');
    const sinFuente = document.getElementById('ac-cita-sin-fuente').checked;
    const estilo = document.getElementById('ac-cita-estilo').value;
    if (sinFuente || !estilo || !window.SQPR || !window.SQPR.formatCitation) { preview.textContent = ''; return; }
    preview.textContent = window.SQPR.formatCitation(estilo, {
      autor: document.getElementById('ac-cita-autor').value.trim(),
      anio: document.getElementById('ac-cita-anio').value.trim(),
      tituloOriginal: document.getElementById('ac-cita-titulo-original').value.trim(),
      publicacion: document.getElementById('ac-fuente-texto').value.trim(),
      url: document.getElementById('brigada-url-contenido').value.trim(),
      fechaAcceso: document.getElementById('ac-cita-fecha-acceso').value,
    });
  }

  // Selector visual de imágenes, compartido entre Noticias y Contenidos:
  // cada formulario llama bindImagePicker(inputId, previewId, botonId) una
  // vez; el modal (uno solo en la página) recuerda a qué campo debe escribir
  // el resultado mientras esté abierto.
  let currentImageTarget = null;
  let imagesManifestCache = null;
  let imagePickerModalBound = false;

  function bindImagePicker(inputId, previewId, buttonId) {
    document.getElementById(inputId).addEventListener('input', () => updateImagePreview(inputId, previewId));
    document.getElementById(buttonId).addEventListener('click', () => openImagePicker(inputId, previewId));
    if (!imagePickerModalBound) {
      imagePickerModalBound = true;
      document.getElementById('image-picker-close').addEventListener('click', closeImagePicker);
      document.getElementById('image-picker-modal').addEventListener('click', (e) => {
        if (e.target.id === 'image-picker-modal') closeImagePicker();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('image-picker-modal').hidden) closeImagePicker();
      });
    }
  }

  function updateImagePreview(inputId, previewId) {
    const src = document.getElementById(inputId).value.trim();
    const preview = document.getElementById(previewId);
    if (src) { preview.src = src; preview.hidden = false; } else { preview.hidden = true; preview.src = ''; }
  }

  async function openImagePicker(inputId, previewId) {
    currentImageTarget = { inputId, previewId };
    const grid = document.getElementById('image-picker-grid');
    document.getElementById('image-picker-modal').hidden = false;
    if (!imagesManifestCache) {
      grid.innerHTML = '<p class="foro-loading">Cargando...</p>';
      try {
        imagesManifestCache = await fetch('images-manifest.json').then((r) => r.json());
      } catch (err) {
        grid.innerHTML = `<p class="foro-error">No se pudo cargar la galería: ${escapeHtml(err.message)}</p>`;
        return;
      }
    }
    grid.innerHTML = imagesManifestCache.map((src) =>
      `<button type="button" class="image-picker-item" data-src="${src}"><img src="${src}" alt="" loading="lazy"></button>`
    ).join('');
    grid.querySelectorAll('.image-picker-item').forEach((btn) => btn.addEventListener('click', () => {
      if (!currentImageTarget) return;
      document.getElementById(currentImageTarget.inputId).value = btn.dataset.src;
      updateImagePreview(currentImageTarget.inputId, currentImageTarget.previewId);
      closeImagePicker();
    }));
  }

  function closeImagePicker() {
    document.getElementById('image-picker-modal').hidden = true;
  }

  // Extrae el ID de video de cualquier formato de enlace de YouTube
  // (watch?v=, youtu.be/, embed/, shorts/) para poder normalizar a la URL
  // embebible que usa el reproductor en linea (.card-play).
  function extraerYoutubeId(url) {
    const patrones = [
      /youtube\.com\/watch\?v=([\w-]{11})/,
      /youtu\.be\/([\w-]{11})/,
      /youtube\.com\/embed\/([\w-]{11})/,
      /youtube\.com\/shorts\/([\w-]{11})/,
    ];
    for (const p of patrones) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  // Rellena titulo/portada/fuente desde el oembed publico de YouTube (sin
  // llave de API, gratis). NO toca el resumen (ac-subtitulo) a proposito --
  // esa redaccion original la escribe el admin, incluso cuando el video es
  // de otro canal (ver ac-fuente-texto/brigada-url-contenido, que si se rellenan
  // con el canal real para dar credito correcto).
  async function autocompletarYoutube() {
    const statusEl = document.getElementById('ac-youtube-status');
    const raw = document.getElementById('ac-url-media').value.trim();
    const id = extraerYoutubeId(raw);
    if (!id) {
      statusEl.textContent = 'Pega un enlace valido de YouTube primero (watch, youtu.be, embed o shorts).';
      return;
    }
    statusEl.textContent = 'Buscando datos del video...';
    try {
      const watchUrl = `https://www.youtube.com/watch?v=${id}`;
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`);
      if (!res.ok) throw new Error('No se encontro ese video (¿es privado o fue eliminado?).');
      const data = await res.json();

      document.getElementById('ac-url-media').value = `https://www.youtube.com/embed/${id}`;
      document.getElementById('ac-tipo-formato').value = 'video';
      if (!document.getElementById('ac-titulo').value.trim()) document.getElementById('ac-titulo').value = data.title || '';
      if (!document.getElementById('ac-fuente-texto').value.trim()) document.getElementById('ac-fuente-texto').value = data.author_name || '';
      if (!document.getElementById('brigada-url-contenido').value.trim()) document.getElementById('brigada-url-contenido').value = data.author_url || watchUrl;
      if (!document.getElementById('ac-url-portada').value.trim() && data.thumbnail_url) {
        document.getElementById('ac-url-portada').value = data.thumbnail_url;
        updateImagePreview('ac-url-portada', 'ac-url-portada-preview');
      }
      if (!document.getElementById('ac-portada-alt').value.trim()) document.getElementById('ac-portada-alt').value = data.title || '';
      statusEl.textContent = `Listo: "${data.title}" — canal ${data.author_name}. Revisa los campos y escribe tu resumen antes de guardar.`;
    } catch (err) {
      statusEl.textContent = 'No se pudo autocompletar: ' + err.message;
    }
  }

  // ── Selector del canal propio de YouTube (@sabiasquePR) ──────
  // Usa una llave de API de Google restringida por dominio (segura para
  // exponer en el navegador). No requiere que el admin inicie sesion en
  // YouTube -- solo lee datos publicos del canal.
  const YOUTUBE_HANDLE = 'sabiasquePR';
  let youtubeVideosCache = null;

  async function abrirSelectorCanalYoutube() {
    const grid = document.getElementById('youtube-picker-grid');
    document.getElementById('youtube-picker-modal').hidden = false;
    const apiKey = window.SITE_CONFIG && window.SITE_CONFIG.youtubeApiKey;
    if (!apiKey) {
      grid.innerHTML = '<p class="foro-error">No hay una llave de YouTube configurada (YOUTUBE_API_KEY). Pídele a tu administrador de infraestructura que la agregue.</p>';
      return;
    }
    if (!youtubeVideosCache) {
      grid.innerHTML = '<p class="foro-loading">Cargando videos del canal...</p>';
      try {
        youtubeVideosCache = await cargarVideosDelCanal(apiKey);
      } catch (err) {
        grid.innerHTML = `<p class="foro-error">No se pudo cargar el canal: ${escapeHtml(err.message)}</p>`;
        return;
      }
    }
    if (!youtubeVideosCache.length) {
      grid.innerHTML = '<p class="foro-empty">El canal no tiene videos públicos.</p>';
      return;
    }
    grid.innerHTML = youtubeVideosCache.map((v) => `
      <button type="button" class="image-picker-item" data-id="${v.id}" data-titulo="${escapeHtml(v.titulo)}" data-thumb="${v.miniatura}">
        <img src="${v.miniatura}" alt="" loading="lazy">
        <span class="image-picker-item-title">${escapeHtml(v.titulo)}</span>
      </button>`).join('');
    grid.querySelectorAll('.image-picker-item').forEach((btn) => btn.addEventListener('click', () => {
      document.getElementById('ac-url-media').value = `https://www.youtube.com/embed/${btn.dataset.id}`;
      document.getElementById('ac-tipo-formato').value = 'video';
      if (!document.getElementById('ac-titulo').value.trim()) document.getElementById('ac-titulo').value = btn.dataset.titulo;
      if (!document.getElementById('ac-fuente-texto').value.trim()) document.getElementById('ac-fuente-texto').value = 'Did U Know? PR';
      if (!document.getElementById('brigada-url-contenido').value.trim()) document.getElementById('brigada-url-contenido').value = `https://www.youtube.com/@${YOUTUBE_HANDLE}`;
      if (!document.getElementById('ac-url-portada').value.trim()) {
        document.getElementById('ac-url-portada').value = btn.dataset.thumb;
        updateImagePreview('ac-url-portada', 'ac-url-portada-preview');
      }
      if (!document.getElementById('ac-portada-alt').value.trim()) document.getElementById('ac-portada-alt').value = btn.dataset.titulo;
      cerrarSelectorCanalYoutube();
    }));
  }

  async function cargarVideosDelCanal(apiKey) {
    const canalRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${YOUTUBE_HANDLE}&key=${apiKey}`);
    const canalData = await canalRes.json();
    if (!canalRes.ok) throw new Error(canalData.error?.message || `Error de YouTube (HTTP ${canalRes.status}).`);
    const uploadsId = canalData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) throw new Error('No se encontró el canal.');

    const videosRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${uploadsId}&key=${apiKey}`);
    const videosData = await videosRes.json();
    if (!videosRes.ok) throw new Error(videosData.error?.message || `Error de YouTube (HTTP ${videosRes.status}).`);

    return (videosData.items || []).map((item) => ({
      id: item.snippet.resourceId.videoId,
      titulo: item.snippet.title,
      miniatura: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
    }));
  }

  function cerrarSelectorCanalYoutube() {
    document.getElementById('youtube-picker-modal').hidden = true;
  }

  async function loadContenidos() {
    const el = document.getElementById('admin-contenidos-list');
    el.innerHTML = '<p class="foro-loading">Cargando...</p>';
    try {
      const data = await apiFetch('/api/contenidos');
      contenidosCache = data.contenidos;
      renderContenidosList();
    } catch (err) {
      el.innerHTML = `<p class="foro-error">${escapeHtml(err.message)}</p>`;
    }
  }

  // Desde el Taller: abre en edición la pieza que salió de una semilla (recarga la lista, porque es nueva).
  async function abrirContenidoPorId(id) {
    await loadContenidos();
    const item = contenidosCache.find((c) => c.id === id);
    if (!item) { alert('No encontré esa pieza en Contenidos. Búscala en la pestaña Contenidos.'); return; }
    activarTab('contenidos');
    openContenidoForm(item);
  }

  function renderContenidosList() {
    const el = document.getElementById('admin-contenidos-list');
    const q = (document.getElementById('admin-contenidos-search').value || '').toLowerCase();
    const items = contenidosCache.filter((c) => c.titulo.toLowerCase().includes(q));
    if (!items.length) { el.innerHTML = '<p class="foro-empty">Sin resultados.</p>'; return; }

    // Acordeon por subseccion (orden alfabetico de las 4 secciones de
    // Revolucion Humana) -- agrupa visualmente sin tocar loadContenidos()
    // ni el formulario de crear/editar, que siguen igual. Lo que no tiene
    // subseccion se agrupa aparte por SECCION (Educacion, Noticias...) en
    // vez de mezclarse todo en un solo "otros" -- Educacion no usa
    // subseccion (ese campo es propio de Revolucion Humana), no es que le
    // falte clasificar.
    const gruposSubseccion = new Map();
    SUBSECCION_ORDEN.forEach((s) => gruposSubseccion.set(s, []));
    const gruposSeccion = new Map();
    items.forEach((c) => {
      if (c.subseccion && gruposSubseccion.has(c.subseccion)) {
        gruposSubseccion.get(c.subseccion).push(c);
        return;
      }
      const clave = c.seccion || '__sin_seccion';
      if (!gruposSeccion.has(clave)) gruposSeccion.set(clave, []);
      gruposSeccion.get(clave).push(c);
    });
    const seccionEntries = Array.from(gruposSeccion.entries())
      .sort((a, b) => (SECCION_LABEL[a[0]] || a[0]).localeCompare(SECCION_LABEL[b[0]] || b[0], 'es'));
    const grupos = new Map([
      ...gruposSubseccion,
      ...seccionEntries.map(([clave, lista]) => [`seccion:${clave}`, lista]),
    ]);

    const itemHtml = (c) => `
      <div class="synth-item" data-tema="${temaParaClasificacion(c.seccion, c.subseccion)}">
        <div class="synth-item-thumb" style="background-image:url('${escapeHtml(c.url_portada || '')}')"></div>
        <div class="synth-item-info">
          <strong>${escapeHtml(c.titulo)}</strong>
          <div class="synth-item-badges">
            ${c.publicado === false ? '<span class="synth-badge synth-badge-borrador">Borrador</span>' : ''}
            ${c.destacado ? '<span class="synth-badge synth-badge-destacado">★ Destacado</span>' : ''}
            ${c.es_premium ? '<span class="synth-badge synth-badge-premium">💎 Apoyo</span>' : ''}
            <span class="synth-badge synth-badge-seccion">${SECCION_LABEL[c.seccion] || c.seccion}${c.subseccion ? ' · ' + (SUBSECCION_LABEL[c.subseccion] || c.subseccion) : ''}</span>
            <span class="synth-badge synth-badge-seccion">${TIPO_LABEL[c.tipo_formato] || c.tipo_formato}</span>
          </div>
          <span class="synth-item-meta">${escapeHtml(String(c.fecha_publicacion).slice(0, 10))}</span>
        </div>
        <div class="synth-item-actions">
          <button type="button" class="admin-btn-edit" data-id="${c.id}">Editar</button>
          <button type="button" class="admin-btn-delete foro-danger" data-id="${c.id}">Eliminar</button>
        </div>
      </div>`;

    el.innerHTML = Array.from(grupos.entries())
      .filter(([, lista]) => lista.length)
      .map(([clave, lista]) => {
        const titulo = clave.startsWith('seccion:')
          ? (SECCION_LABEL[clave.slice(8)] || clave.slice(8))
          : (SUBSECCION_LABEL[clave] || clave);
        return `
        <details class="synth-group" open>
          <summary class="synth-group-title">${escapeHtml(titulo)} <span class="synth-group-count">${lista.length}</span></summary>
          <div class="synth-group-items">${lista.map(itemHtml).join('')}</div>
        </details>`;
      }).join('');

    el.querySelectorAll('.admin-btn-edit').forEach((btn) => btn.addEventListener('click', () => {
      const item = contenidosCache.find((c) => c.id === btn.dataset.id);
      if (item) openContenidoForm(item);
    }));
    el.querySelectorAll('.admin-btn-delete').forEach((btn) => btn.addEventListener('click', () => deleteContenido(btn.dataset.id)));
  }

  function openContenidoForm(item) {
    if (document.getElementById('ac-cancel')) document.getElementById('ac-cancel').textContent = 'Cancelar';
    document.getElementById('admin-contenidos-form-title').textContent = item ? 'Editar contenido' : 'Nuevo contenido';
    document.getElementById('ac-id').value = item?.id || '';
    document.getElementById('ac-idioma-original').value = item?.idioma_original || 'es';
    document.getElementById('ac-seccion').value = item?.seccion || 'noticias';
    document.getElementById('ac-tipo-formato').value = item?.tipo_formato || 'noticia';
    categoriaGuardada = item?.categoria || '';
    document.getElementById('ac-titulo').value = item?.titulo || '';
    document.getElementById('ac-subtitulo').value = item?.subtitulo_resumen || '';
    document.getElementById('ac-cuerpo').value = item?.cuerpo || '';
    document.getElementById('ac-autor').value = item?.autor || '';
    document.getElementById('ac-subformato').value = item?.subformato || '';
    document.getElementById('ac-divulgacion-ia').value = item?.divulgacion_ia || 'no';
    cargarIaEnSelector(selectorIaContenido, 'ac-divulgacion-ia', item?.ia_herramientas);
    document.getElementById('ac-url-media').value = item?.url_media || '';
    document.getElementById('brigada-url-contenido').value = item?.fuente_url || '';
    pintarFuentesExtra('contenido', item?.fuentes);
    document.getElementById('ac-fuente-texto').value = item?.fuente_texto || '';
    document.getElementById('ac-duracion').value = item?.duracion_min || 1;
    document.getElementById('ac-url-portada').value = item?.url_portada || '';
    document.getElementById('ac-portada-alt').value = item?.portada_alt || '';
    document.getElementById('ac-fecha').value = item?.fecha_publicacion ? String(item.fecha_publicacion).slice(0, 10) : '';
    document.getElementById('ac-destacado').checked = Boolean(item?.destacado);
    document.getElementById('ac-publicado').checked = item ? item.publicado !== false : true;
    document.getElementById('ac-estado').textContent = item
      ? (item.publicado === false ? 'Estado actual: borrador (no se ve en el sitio).' : 'Estado actual: publicado (se ve en el sitio).')
      : '«Guardar borrador» lo deja solo en el panel; «AL AIRE» lo publica en el sitio.';
    llenarClasificacion(window.sqprClasificacion.aValor(
      document.getElementById('ac-seccion').value, item?.subseccion, item?.categoria
    ));
    sincronizarClasificacion();
    document.getElementById('ac-enfoque').value = item?.enfoque || '';
    document.getElementById('ac-premium').checked = Boolean(item?.es_premium);
    for (const [id, campo] of CASILLAS_FORM) document.getElementById(id).checked = Boolean(item?.[campo]);
    document.getElementById('ac-cita-sin-fuente').checked = Boolean(item?.cita_sin_fuente_externa);
    document.getElementById('ac-cita-estilo').value = item?.cita_estilo || '';
    document.getElementById('ac-cita-autor').value = item?.cita_autor || '';
    document.getElementById('ac-cita-anio').value = item?.cita_anio || '';
    document.getElementById('ac-cita-titulo-original').value = item?.cita_titulo_original || '';
    document.getElementById('ac-cita-fecha-acceso').value = item?.cita_fecha_acceso
      ? String(item.cita_fecha_acceso).slice(0, 10)
      : (item ? '' : new Date().toISOString().slice(0, 10));
    toggleCitationFields();
    updateCitationPreview();
    updateImagePreview('ac-url-portada', 'ac-url-portada-preview');
    setStatus(document.getElementById('ac-status'), '', '');
    actualizarTemaContenidos();
    activarSynthPanel('clasificacion');
    refrescarPanelTraduccion('contenido');
    document.getElementById('admin-contenidos-form-box').style.display = 'block';
    document.getElementById('admin-contenidos-form-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeContenidoForm() {
    document.getElementById('admin-contenidos-form-box').style.display = 'none';
    document.getElementById('admin-contenidos-form').reset();
    updateImagePreview('ac-url-portada', 'ac-url-portada-preview');
  }

  async function submitContenido(e) {
    e.preventDefault();
    const statusEl = document.getElementById('ac-status');
    const id = document.getElementById('ac-id').value;
    const sinFuente = document.getElementById('ac-cita-sin-fuente').checked;
    const body = {
      seccion: document.getElementById('ac-seccion').value,
      tipoFormato: document.getElementById('ac-tipo-formato').value,
      categoria: document.getElementById('ac-categoria').value,
      titulo: document.getElementById('ac-titulo').value.trim(),
      subtituloResumen: document.getElementById('ac-subtitulo').value.trim(),
      cuerpo: document.getElementById('ac-cuerpo').value.trim() || null,
      autor: document.getElementById('ac-autor').value.trim() || null,
      subformato: document.getElementById('ac-subformato').value || null,
      divulgacionIa: document.getElementById('ac-divulgacion-ia').value,
      iaHerramientas: selectorIaContenido.leer(),
      urlMedia: document.getElementById('ac-url-media').value.trim() || null,
      fuenteUrl: document.getElementById('brigada-url-contenido').value.trim() || null,
      fuentes: leerFuentesExtraDe('contenido'),
      fuenteTexto: document.getElementById('ac-fuente-texto').value.trim() || null,
      duracionMin: Number(document.getElementById('ac-duracion').value),
      urlPortada: document.getElementById('ac-url-portada').value.trim(),
      portadaAlt: textoAlternativo(document.getElementById('ac-portada-alt').value, document.getElementById('ac-titulo').value),
      fechaPublicacion: document.getElementById('ac-fecha').value,
      destacado: destacadoPermitido(document.getElementById('ac-destacado').checked, document.getElementById('ac-publicado').checked),
      publicado: document.getElementById('ac-publicado').checked,
      subseccion: document.getElementById('ac-subseccion').value || null,
      enfoque: document.getElementById('ac-enfoque').value || null,
      idiomaOriginal: document.getElementById('ac-idioma-original').value,
      esPremium: document.getElementById('ac-premium').checked,
      ultimaHora: document.getElementById('ac-ultima-hora').checked,
      actualizada: document.getElementById('ac-actualizada').checked,
      fijada: document.getElementById('ac-fijada').checked,
      verificada: document.getElementById('ac-verificada').checked,
      sensible: document.getElementById('ac-sensible').checked,
      citaSinFuenteExterna: sinFuente,
      citaEstilo: sinFuente ? null : (document.getElementById('ac-cita-estilo').value || null),
      citaAutor: sinFuente ? null : (document.getElementById('ac-cita-autor').value.trim() || null),
      citaAnio: sinFuente ? null : (document.getElementById('ac-cita-anio').value.trim() || null),
      citaTituloOriginal: sinFuente ? null : (document.getElementById('ac-cita-titulo-original').value.trim() || null),
      citaFechaAcceso: sinFuente ? null : (document.getElementById('ac-cita-fecha-acceso').value || null),
    };
    setStatus(statusEl, 'info', 'Guardando...');
    try {
      const res = id
        ? await apiFetch(`/api/contenidos/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiFetch('/api/contenidos', { method: 'POST', body: JSON.stringify(body) });
      document.getElementById('ac-estado').textContent = body.publicado
        ? 'Estado actual: publicado (se ve en el sitio).' : 'Estado actual: borrador (no se ve en el sitio).';
      await despuesDeGuardar({
        tipo: 'contenido', pieza: res.contenido, idInput: 'ac-id', tituloForm: 'admin-contenidos-form-title', tituloNuevo: 'Editar contenido',
        botonCerrar: 'ac-cancel', statusEl,
        recargarLista: loadContenidos,
        mensaje: body.publicado ? 'Publicado ✔ (ya se ve en el sitio).' : 'Guardado como borrador ✔ (no se ve en el sitio).',
      });
    } catch (err) {
      setStatus(statusEl, 'error tr-status-grande', '' + err.message);
    }
  }

  async function deleteContenido(id) {
    if (!confirm('¿Eliminar este contenido? Esta acción no se puede deshacer.')) return;
    try {
      await apiFetch(`/api/contenidos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      loadContenidos();
    } catch (err) {
      alert('' + err.message);
    }
  }

  // ── PRODUCTOS ────────────────────────────────────────────
  function bindProductos() {
    document.getElementById('admin-productos-new').addEventListener('click', () => openProductoForm());
    document.getElementById('ap-cancel').addEventListener('click', closeProductoForm);
    document.getElementById('admin-productos-search').addEventListener('input', renderProductosList);
    document.getElementById('admin-productos-form').addEventListener('submit', submitProducto);
  }

  async function loadProductos() {
    const el = document.getElementById('admin-productos-list');
    el.innerHTML = '<p class="foro-loading">Cargando...</p>';
    try {
      const data = await apiFetch('/api/productos');
      productosCache = data.productos;
      renderProductosList();
    } catch (err) {
      el.innerHTML = `<p class="foro-error">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderProductosList() {
    const el = document.getElementById('admin-productos-list');
    const q = (document.getElementById('admin-productos-search').value || '').toLowerCase();
    const items = productosCache.filter((p) => p.nombre.toLowerCase().includes(q));
    el.innerHTML = items.length ? items.map((p) => `
      <div class="synth-item">
        <div class="synth-item-thumb" style="background-image:url('${escapeHtml(p.imagen || '')}')"></div>
        <div class="synth-item-info">
          <strong>${escapeHtml(p.nombre)}</strong>
          <div class="synth-item-badges">
            <span class="synth-badge synth-badge-premium">$${Number(p.precio).toFixed(2)}</span>
            ${p.disponible ? '' : '<span class="synth-badge synth-badge-destacado">Oculto</span>'}
          </div>
        </div>
        <div class="synth-item-actions">
          <button type="button" class="admin-btn-edit" data-id="${p.id}">Editar</button>
          <button type="button" class="admin-btn-delete foro-danger" data-id="${p.id}">Eliminar</button>
        </div>
      </div>`).join('') : '<p class="foro-empty">Sin resultados.</p>';

    el.querySelectorAll('.admin-btn-edit').forEach((btn) => btn.addEventListener('click', () => {
      const item = productosCache.find((p) => p.id === btn.dataset.id);
      if (item) openProductoForm(item);
    }));
    el.querySelectorAll('.admin-btn-delete').forEach((btn) => btn.addEventListener('click', () => deleteProducto(btn.dataset.id)));
  }

  function openProductoForm(item) {
    if (document.getElementById('ap-cancel')) document.getElementById('ap-cancel').textContent = 'Cancelar';
    document.getElementById('admin-productos-form-title').textContent = item ? 'Editar producto' : 'Nuevo producto';
    document.getElementById('ap-id').value = item?.id || '';
    document.getElementById('ap-nombre').value = item?.nombre || '';
    document.getElementById('ap-descripcion').value = item?.descripcion || '';
    document.getElementById('ap-precio').value = item?.precio ?? '';
    document.getElementById('ap-imagen').value = item?.imagen || '';
    document.getElementById('ap-imagen-alt').value = item?.imagen_alt || '';
    document.getElementById('ap-stripe-price-id').value = item?.stripe_price_id || '';
    document.getElementById('ap-stripe-link').value = item?.stripe_link || '';
    document.getElementById('ap-disponible').checked = item ? !!item.disponible : true;
    setStatus(document.getElementById('ap-status'), '', '');
    refrescarPanelTraduccion('producto');
    document.getElementById('admin-productos-form-box').style.display = 'block';
    document.getElementById('admin-productos-form-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeProductoForm() {
    document.getElementById('admin-productos-form-box').style.display = 'none';
    document.getElementById('admin-productos-form').reset();
  }

  async function submitProducto(e) {
    e.preventDefault();
    const statusEl = document.getElementById('ap-status');
    const id = document.getElementById('ap-id').value;
    const body = {
      nombre: document.getElementById('ap-nombre').value.trim(),
      descripcion: document.getElementById('ap-descripcion').value.trim(),
      precio: Number(document.getElementById('ap-precio').value),
      imagen: document.getElementById('ap-imagen').value.trim(),
      imagenAlt: textoAlternativo(document.getElementById('ap-imagen-alt').value, document.getElementById('ap-nombre').value),
      stripeLink: document.getElementById('ap-stripe-link').value.trim() || null,
      stripePriceId: document.getElementById('ap-stripe-price-id').value.trim() || null,
      disponible: document.getElementById('ap-disponible').checked,
    };
    setStatus(statusEl, 'info', 'Guardando...');
    try {
      const res = id
        ? await apiFetch(`/api/productos/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiFetch('/api/productos', { method: 'POST', body: JSON.stringify(body) });
      await despuesDeGuardar({
        tipo: 'producto', pieza: res.producto, idInput: 'ap-id', tituloForm: 'admin-productos-form-title', tituloNuevo: 'Editar producto',
        botonCerrar: 'ap-cancel', statusEl,
        recargarLista: loadProductos, mensaje: 'Guardado ✔.',
      });
    } catch (err) {
      setStatus(statusEl, 'error tr-status-grande', '' + err.message);
    }
  }

  async function deleteProducto(id) {
    if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
    try {
      await apiFetch(`/api/productos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      loadProductos();
    } catch (err) {
      alert('' + err.message);
    }
  }

  // ── AYUDA: tooltips + manual integrado ───────────────────
  // Una sola fuente de datos alimenta el tooltip al pasar el cursor Y el
  // manual completo del boton "?" -- agregar un agente/panel nuevo mas
  // adelante solo necesita una entrada nueva aqui, nada mas se toca.
  const AYUDA = {
    clasificacion: { titulo: 'Clasificación', desc: 'Decide en qué parte del sitio vive este contenido.', incluir: 'Sección, sub-sección (si aplica), enfoque (solo Corrupción Humana), tipo de formato y categoría.', agentivo: false },
    contenido: { titulo: 'Contenido', desc: 'El texto que se publica tal cual, sin editar después.', incluir: 'Título, resumen de 2-3 oraciones, cuerpo (opcional), autor, y si se usó IA.', agentivo: false },
    multimedia: { titulo: 'Multimedia', desc: 'El video/audio embebido y la imagen de portada del contenido.', incluir: 'Enlace de video/audio (si el tipo lo requiere), imagen de portada y su texto alternativo.', agentivo: false },
    citacion: { titulo: 'Citación', desc: 'De dónde salió la información, para dar crédito correctamente.', incluir: 'URL y nombre de la fuente, autor, año, estilo de citación y fecha de acceso (esta última siempre la pones tú).', agentivo: false },
    investigador: { titulo: 'Investigador', desc: 'Organiza una fuente (URL o texto pegado) en notas de investigación.', incluir: 'Se usa desde el Nivel 4 del formulario de Contenidos.', agentivo: true },
    redactor: { titulo: 'Redactor', desc: 'Escribe el borrador final con el tono propio de cada sección.', incluir: 'Se usa después del Investigador, en el mismo Nivel 4.', agentivo: true },
    productos: { titulo: 'Productos', desc: 'Artículos de la tienda — lo que aparece en /tienda con su botón de compra.', incluir: 'Nombre, descripción, precio, imagen y el Price ID de Stripe para que el checkout funcione.', agentivo: false },
  };

  function ayudaHtml(clave) {
    const a = AYUDA[clave];
    if (!a) return '';
    return `
      <p class="ayuda-titulo">${escapeHtml(a.titulo)}${a.agentivo ? ' <span class="ayuda-badge">🤖 AGENTIVO</span>' : ''}</p>
      <p class="ayuda-desc">${escapeHtml(a.desc)}</p>
      ${a.incluir ? `<p class="ayuda-incluir"><strong>Incluye:</strong> ${escapeHtml(a.incluir)}</p>` : ''}`;
  }

  function claveAyuda(el) {
    return el ? (el.dataset.help || el.dataset.panel) : null;
  }

  function mostrarAyudaTooltip(el) {
    const clave = claveAyuda(el);
    if (!clave || !AYUDA[clave]) return;
    const tooltip = document.getElementById('ayuda-tooltip');
    tooltip.innerHTML = ayudaHtml(clave);
    tooltip.hidden = false;
    const rect = el.getBoundingClientRect();
    tooltip.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 320)) + 'px';
    tooltip.style.top = (rect.bottom + window.scrollY + 8) + 'px';
  }

  function bindAyuda() {
    const panel = document.getElementById('admin-panel');
    const tooltip = document.getElementById('ayuda-tooltip');

    const AYUDA_HOVER_SELECTOR = '[data-help], .synth-level-card, .news-level-card';
    panel.addEventListener('mouseover', (e) => {
      const el = e.target.closest(AYUDA_HOVER_SELECTOR);
      if (el) mostrarAyudaTooltip(el);
    });
    panel.addEventListener('mouseout', (e) => {
      const el = e.target.closest(AYUDA_HOVER_SELECTOR);
      if (el && !el.contains(e.relatedTarget)) tooltip.hidden = true;
    });
    panel.addEventListener('focusin', (e) => {
      const el = e.target.closest(AYUDA_HOVER_SELECTOR);
      if (el) mostrarAyudaTooltip(el);
    });
    panel.addEventListener('focusout', (e) => {
      const el = e.target.closest(AYUDA_HOVER_SELECTOR);
      if (el) tooltip.hidden = true;
    });

    document.getElementById('ayuda-btn').addEventListener('click', () => {
      document.getElementById('ayuda-modal-body').innerHTML = Object.keys(AYUDA)
        .map((clave) => `<section class="ayuda-modal-item">${ayudaHtml(clave)}</section>`).join('');
      document.getElementById('ayuda-modal').hidden = false;
    });
    document.getElementById('ayuda-modal-close').addEventListener('click', () => {
      document.getElementById('ayuda-modal').hidden = true;
    });
    document.getElementById('ayuda-modal').addEventListener('click', (e) => {
      if (e.target.id === 'ayuda-modal') document.getElementById('ayuda-modal').hidden = true;
    });
  }

  // ── UTILIDADES ───────────────────────────────────────────
  function setStatus(el, type, msg) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'form-status ' + type;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }
})();
