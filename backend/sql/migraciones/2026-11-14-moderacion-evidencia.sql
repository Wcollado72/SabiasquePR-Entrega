-- Moderacion con evidencia, decisiones auditables, restricciones y apelaciones (2026-11-14).
-- Medidas de proteccion de menores y moderacion (evidencia, reportes y suspensiones).
-- Cambio ADITIVO: solo tablas nuevas; no toca datos existentes. Idempotente.
-- Plan de vuelta atras: DROP TABLE moderacion_apelaciones, moderacion_restricciones, moderacion_decisiones,
--   moderacion_evidencias, moderacion_casos;  (en ese orden).
-- *** NO APLICAR EN PRODUCCION SIN EL ✓ EXPLICITO DE WILLIAM. *** Primero se prueba en una rama/base de prueba.
-- Todas las tablas tienen RLS activado y SIN politicas: solo el servidor (service role) las lee o escribe.
-- Principios: la evidencia es de SOLO administracion; nunca se guarda ni reenvia material de abuso infantil (solo metadatos);
-- las decisiones son de solo anadir (no se editan); la persona amenazada se RESTRINGE (puede leer y reportar, no escribir) y
-- solo el autor se suspende (decision del administrador, 2026-11-14).

CREATE TABLE IF NOT EXISTS moderacion_casos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nivel        text NOT NULL CHECK (nivel IN ('bajo', 'elevado', 'critico')),
  categoria    text NOT NULL,
  tipo_item    text NOT NULL,                       -- p.ej. 'debate_post', 'debate_comentario', 'articulo_comentario'
  item_id      uuid NOT NULL,
  autor_id     uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  afectado_id  uuid REFERENCES perfiles(id) ON DELETE SET NULL,   -- la persona amenazada (si la hay)
  posible_menor boolean NOT NULL DEFAULT false,     -- alerta adulto <-> posible menor
  estado       text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_revision', 'resuelto')),
  ocultado     boolean NOT NULL DEFAULT false,      -- la Guardiana OCULTA, nunca borra
  creado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_item, item_id)
);
CREATE INDEX IF NOT EXISTS idx_moderacion_casos_estado ON moderacion_casos (estado, nivel, creado_en DESC);
ALTER TABLE moderacion_casos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS moderacion_evidencias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id        uuid NOT NULL REFERENCES moderacion_casos(id) ON DELETE CASCADE,
  contenido      text NOT NULL,                     -- copia del texto antes de ocultarlo (solo texto; nunca archivos)
  contexto       jsonb NOT NULL DEFAULT '[]',       -- mensajes cercanos del hilo, para evitar falsos positivos
  sha256         text NOT NULL,                     -- huella del contenido: prueba de que no se alteró
  capturado_por  text NOT NULL DEFAULT 'sistema',
  capturado_en   timestamptz NOT NULL DEFAULT now(),
  conservar_hasta timestamptz                        -- el plazo lo confirma Jurista con fuente oficial (18 U.S.C. §2258A)
);
CREATE INDEX IF NOT EXISTS idx_moderacion_evidencias_caso ON moderacion_evidencias (caso_id);
ALTER TABLE moderacion_evidencias ENABLE ROW LEVEL SECURITY;

-- Registro de decisiones del administrador: de solo anadir (auditable).
CREATE TABLE IF NOT EXISTS moderacion_decisiones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id     uuid NOT NULL REFERENCES moderacion_casos(id) ON DELETE CASCADE,
  decidido_por text NOT NULL,                       -- 'guardiana' o el admin
  decision    text NOT NULL CHECK (decision IN ('mantener', 'ocultar', 'restaurar', 'suspender_temporal', 'suspender_permanente', 'restringir', 'levantar', 'escalar')),
  razon       text NOT NULL,
  cuentas     jsonb NOT NULL DEFAULT '[]',
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderacion_decisiones_caso ON moderacion_decisiones (caso_id, creado_en);
ALTER TABLE moderacion_decisiones ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS moderacion_restricciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('suspension', 'restriccion')),   -- restriccion = puede leer y reportar, no escribir
  caso_id     uuid REFERENCES moderacion_casos(id) ON DELETE SET NULL,
  motivo      text NOT NULL,
  desde       timestamptz NOT NULL DEFAULT now(),
  hasta       timestamptz,                          -- NULL = hasta que el administrador decida
  activa      boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_moderacion_restricciones_usuario ON moderacion_restricciones (usuario_id) WHERE activa;
ALTER TABLE moderacion_restricciones ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS moderacion_apelaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restriccion_id uuid NOT NULL REFERENCES moderacion_restricciones(id) ON DELETE CASCADE,
  usuario_id     uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  mensaje        text NOT NULL CHECK (char_length(mensaje) <= 2000),
  estado         text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  resuelto_en    timestamptz
);
ALTER TABLE moderacion_apelaciones ENABLE ROW LEVEL SECURITY;
