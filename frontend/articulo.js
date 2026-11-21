// ============================================================
// articulo.js — Sabías que PR · Redirección (2026-11-16)
// ============================================================
// «Noticias rápidas» ya no existe: todo vive en Contenidos y se lee en recurso.html. Quien llegue con un enlace viejo
// (articulo.html?id=...) pasa a la página nueva con el mismo id.
// ============================================================
(function () {
  const id = new URLSearchParams(location.search).get('id');
  location.replace(id ? 'recurso.html?id=' + encodeURIComponent(id) : 'noticias.html');
})();
