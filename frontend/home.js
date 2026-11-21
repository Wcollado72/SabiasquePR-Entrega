// ============================================================
// home.js — Sabías que PR · Portada editorial
// ============================================================
// Pide a la API los contenidos de la sección Noticias y pinta la pieza destacada en la pantalla grande
// (la marcada como `destacado`, o la más reciente) y las tarjetas. Desde 2026-11-16 ya no existe «Noticias rápidas».
// ============================================================

(function () {
  const cfg = window.SITE_CONFIG || {};
  const API_URL = cfg.apiUrl || 'http://localhost:3000';
  const LATEST_MAX = 6;
  const SLOW_MS = 6000; // el plan gratuito de Render puede tardar en despertar

  document.addEventListener('DOMContentLoaded', load);

  async function load() {
    const featuredEl = document.getElementById('home-featured');
    const latestEl = document.getElementById('home-latest');
    const hintEl = document.getElementById('home-hint');
    if (!featuredEl || !latestEl) return;

    const slowTimer = setTimeout(() => {
      if (hintEl) hintEl.textContent = 'Cargando… el servidor puede tardar unos segundos en despertar.';
    }, SLOW_MS);

    try {
      const res = await fetch(window.SQPR.withLang(API_URL + '/api/contenidos?seccion=noticias'));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
      render(data.contenidos || [], featuredEl, latestEl);
    } catch (err) {
      showEmpty(featuredEl, latestEl, 'No se pudieron cargar las noticias por ahora. Inténtalo de nuevo en unos minutos.');
    } finally {
      clearTimeout(slowTimer);
      featuredEl.setAttribute('aria-busy', 'false');
      if (hintEl) hintEl.textContent = '';
    }
  }

  function render(noticias, featuredEl, latestEl) {
    if (!noticias.length) {
      showEmpty(featuredEl, latestEl, 'Aún no hay noticias publicadas.');
      return;
    }
    const pinned = noticias.find((n) => n.destacado);
    const featured = pinned || noticias[0];
    const rest = noticias.filter((n) => n !== featured).slice(0, LATEST_MAX);

    featuredEl.innerHTML = window.SQPR.contenidoCardHtml(featured).replace('<article class="card">', '<article class="card card-hero">');

    const head = document.getElementById('home-latest-head');
    if (!rest.length) {
      if (head) head.hidden = true;
      latestEl.hidden = true;
      return;
    }
    latestEl.innerHTML = rest.map((n) => window.SQPR.contenidoCardHtml(n)).join('');
  }

  function showEmpty(featuredEl, latestEl, msg) {
    featuredEl.innerHTML = '<p class="empty-state">' + window.SQPR.escapeHtml(msg) + '</p>';
    const head = document.getElementById('home-latest-head');
    if (head) head.hidden = true;
    latestEl.hidden = true;
  }
})();
