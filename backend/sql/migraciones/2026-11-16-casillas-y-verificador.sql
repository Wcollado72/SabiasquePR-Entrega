-- 2026-11-16 · Casillas editoriales de `contenidos` y seccion «verificador» (video instruccional).
-- Orden del administrador: «crea las columnas». Se aplica sola al arrancar el servidor (src/migraciones-auto.js); este archivo es el mismo SQL
-- por si se prefiere pegarlo a mano en el editor SQL de Supabase. Es IDEMPOTENTE y solo AGREGA: no cambia ni borra ningun dato.

ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS ultima_hora boolean NOT NULL DEFAULT false;
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS actualizada boolean NOT NULL DEFAULT false;
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS fijada      boolean NOT NULL DEFAULT false;
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS verificada  boolean NOT NULL DEFAULT false;
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS sensible    boolean NOT NULL DEFAULT false;

ALTER TABLE contenidos DROP CONSTRAINT IF EXISTS contenidos_seccion_check;
ALTER TABLE contenidos ADD CONSTRAINT contenidos_seccion_check
  CHECK (seccion IN ('revolucion-humana', 'educacion', 'noticias', 'verificador'));
