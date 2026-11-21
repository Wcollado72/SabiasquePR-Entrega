// Migraciones automaticas e IDEMPOTENTES (2026-11-16). Se corren al arrancar el servidor (server.js), NUNCA en las pruebas (app.js no las llama).
// Solo agregan columnas con valor por defecto y amplian una lista de valores permitidos: no borran ni cambian ningun dato existente.
// Existe porque la base real (Supabase) no se puede tocar desde un panel externo ni desde el editor de codigo: el propio servidor aplica lo que falta.
// El mismo SQL queda anotado en sql/migraciones/2026-11-16-casillas-y-verificador.sql por si alguien prefiere pegarlo a mano en el editor SQL de Supabase.

const COLUMNAS_CASILLAS = ['ultima_hora', 'actualizada', 'fijada', 'verificada', 'sensible'];

async function aplicarMigracionesAuto(pool, log = console) {
  try {
    // 1) Casillas editoriales de `contenidos` (todas empiezan en falso).
    for (const col of COLUMNAS_CASILLAS) {
      await pool.query(`ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS ${col} boolean NOT NULL DEFAULT false`);
    }
    // 2) Seccion nueva «verificador» (video instruccional): solo si la lista permitida todavia no la trae.
    const { rows } = await pool.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'contenidos_seccion_check'");
    if (!rows[0] || !rows[0].def.includes('verificador')) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('ALTER TABLE contenidos DROP CONSTRAINT IF EXISTS contenidos_seccion_check');
        await client.query("ALTER TABLE contenidos ADD CONSTRAINT contenidos_seccion_check CHECK (seccion IN ('revolucion-humana', 'educacion', 'noticias', 'verificador'))");
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
    log.log('Migraciones automaticas: columnas de casillas y seccion «verificador» al dia.');
    return true;
  } catch (err) {
    // Nunca tumba el servidor: si falla, se registra y las rutas sin las columnas nuevas siguen respondiendo.
    log.error('Migraciones automaticas: no se pudieron aplicar (el servidor sigue):', err.message);
    return false;
  }
}

module.exports = { aplicarMigracionesAuto, COLUMNAS_CASILLAS };
