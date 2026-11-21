require('dotenv').config({ quiet: true });
const { buildApp } = require('./app');
const { pool } = require('./db');
const { aplicarMigracionesAuto } = require('./migraciones-auto');

const app = buildApp();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API de Sabias que PR escuchando en http://localhost:${PORT}`);
  // Columnas y valores nuevos (idempotente; si falla, solo se registra).
  aplicarMigracionesAuto(pool);
});
