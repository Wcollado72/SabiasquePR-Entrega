-- Ocultar (no borrar) contenido moderado + registro de reportes a NCMEC (2026-11-14). Segunda parte de la moderacion.
-- Cambio ADITIVO: columnas nuevas con valor por defecto false + una tabla nueva. No toca datos existentes. Idempotente.
-- Plan de vuelta atras: ALTER TABLE foro_posts / foro_comentarios / comentarios DROP COLUMN oculto; DROP TABLE moderacion_reportes_ncmec;
-- Autorizado por el administrador el 2026-11-14 ("como entiendas logico"); se prueba con rollback antes de aplicar.

-- La Guardiana OCULTA, nunca borra: el contenido oculto sigue en la base de datos (evidencia) pero no se muestra al publico.
ALTER TABLE foro_posts       ADD COLUMN IF NOT EXISTS oculto boolean NOT NULL DEFAULT false;
ALTER TABLE foro_comentarios ADD COLUMN IF NOT EXISTS oculto boolean NOT NULL DEFAULT false;
ALTER TABLE comentarios      ADD COLUMN IF NOT EXISTS oculto boolean NOT NULL DEFAULT false;

-- Registro de reportes hechos a la CyberTipline de NCMEC (18 U.S.C. §2258A). La ley pide conservar 1 año; el administrador decidio
-- conservarlos 5 años (permitido: la ley autoriza conservar mas tiempo). Solo guarda numeros, fechas, categoria y la ruta del archivo
-- (el recibo/PDF vive en la carpeta privada docs/privado/ncmec/); NUNCA material de abuso.
CREATE TABLE IF NOT EXISTS moderacion_reportes_ncmec (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id          uuid REFERENCES moderacion_casos(id) ON DELETE SET NULL,
  categoria        text NOT NULL CHECK (categoria IN ('csam', 'trata_de_menores', 'enticement', 'otra')),
  numero_reporte   text,                                   -- el que devuelve NCMEC al enviar
  enviado_en       timestamptz,
  estado           text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviado', 'confirmado', 'cerrado')),
  recibo_ruta      text,                                   -- ruta relativa del recibo en la carpeta privada
  conservar_hasta  timestamptz,                            -- se fija al enviar: enviado_en + 5 años
  notas            text,
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderacion_reportes_ncmec_estado ON moderacion_reportes_ncmec (estado, creado_en DESC);
ALTER TABLE moderacion_reportes_ncmec ENABLE ROW LEVEL SECURITY;
