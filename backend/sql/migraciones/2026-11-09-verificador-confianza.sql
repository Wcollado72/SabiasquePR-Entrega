-- Verificador de Confianza (2026-11-09, rama verificador-confianza). Cambio ADITIVO: tablas nuevas, una columna nueva con
-- valor por defecto y una ampliacion de la lista de agentes de la bitacora. No toca datos existentes.
-- Plan de vuelta atras: DROP TABLE verificador_reportes, verificador_concesiones; ALTER TABLE perfiles DROP COLUMN apoyo_mensual_termino_en;
-- y volver a poner la lista anterior del CHECK de ia_generaciones.
-- Idempotente. NO aplicar en produccion hasta que el dueno lo apruebe.

-- Paquetes de usos: 3 por cada mes de apoyo mensual, 1 por un apoyo unico (reglas en services/verificadorCreditos.js).
CREATE TABLE IF NOT EXISTS verificador_concesiones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN ('mensual', 'unico')),
  cantidad     int NOT NULL CHECK (cantidad > 0),
  usados       int NOT NULL DEFAULT 0 CHECK (usados >= 0),
  otorgado_en  timestamptz NOT NULL DEFAULT now(),
  stripe_ref   text UNIQUE, -- factura o sesion de Stripe que origino el paquete (evita darlo dos veces)
  CHECK (usados <= cantidad)
);
CREATE INDEX IF NOT EXISTS idx_verificador_concesiones_usuario ON verificador_concesiones (usuario_id, otorgado_en);
ALTER TABLE verificador_concesiones ENABLE ROW LEVEL SECURITY;

-- Reportes hechos: se guardan mientras la cuenta este activa (se borran con la cuenta por ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS verificador_reportes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  entrada     jsonb NOT NULL DEFAULT '{}',
  resultado   jsonb NOT NULL,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verificador_reportes_usuario ON verificador_reportes (usuario_id, creado_en DESC);
ALTER TABLE verificador_reportes ENABLE ROW LEVEL SECURITY;

-- Cuando dejo de apoyar cada mes (lo llenara el webhook de Stripe; pendiente de conectar). Arranca la gracia de 15 dias.
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS apoyo_mensual_termino_en timestamptz;

ALTER TABLE ia_generaciones DROP CONSTRAINT IF EXISTS ia_generaciones_agente_check;
ALTER TABLE ia_generaciones ADD CONSTRAINT ia_generaciones_agente_check
  CHECK (agente IN ('investigador', 'redactor', 'traductor', 'clasificadora', 'resumidora', 'correctora', 'guardiana', 'pintora', 'grieta', 'cazadora', 'contrapunto', 'farolera', 'verificador'));
