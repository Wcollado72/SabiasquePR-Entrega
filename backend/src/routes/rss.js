// RSS dinamico (2026-11-16): se arma al momento desde la tabla `contenidos`, asi siempre refleja lo publicado.
// Antes se generaba al construir el sitio desde un archivo fijo con 2 noticias viejas. Netlify lo sirve en /rss.xml (ver netlify.toml).
const express = require('express');
const { pool } = require('../db');
const { enviarError500 } = require('../util/errores');

const router = express.Router();
const SITE_URL = 'https://sabiasquepr.com';
const LIMITE = 30;

function esc(texto) {
  return String(texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fechaRfc822(valor) {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function construirRss(filas) {
  const items = filas.map((c) => {
    const link = `${SITE_URL}/recurso.html?id=${encodeURIComponent(c.id)}`;
    return `  <item>
    <title>${esc(c.titulo)}</title>
    <link>${esc(link)}</link>
    <guid isPermaLink="false">${esc(c.id)}</guid>
    <pubDate>${fechaRfc822(c.fecha_publicacion)}</pubDate>
    <category>${esc(c.categoria)}</category>
    <description>${esc(c.subtitulo_resumen)}</description>
  </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Sabías que PR</title>
    <link>${SITE_URL}</link>
    <description>Noticias, educación e información para quienes creen en un mundo mejor.</description>
    <language>es-pr</language>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${SITE_URL}/images/Coqui.webp</url>
      <title>Sabías que PR</title>
      <link>${SITE_URL}</link>
    </image>
${items}
  </channel>
</rss>
`;
}

// GET /rss.xml -- publico. Solo piezas publicadas; el espacio del Verificador (video instruccional) no es una noticia.
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, titulo, subtitulo_resumen, categoria, fecha_publicacion FROM contenidos
       WHERE publicado = true AND seccion <> 'verificador'
       ORDER BY fecha_publicacion DESC, creado_en DESC LIMIT $1`,
      [LIMITE]
    );
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=600');
    res.send(construirRss(rows));
  } catch (err) { enviarError500(res, err); }
});

module.exports = router;
module.exports.construirRss = construirRss;
