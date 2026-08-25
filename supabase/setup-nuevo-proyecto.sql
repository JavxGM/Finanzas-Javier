-- ═══════════════════════════════════════════════════════════
-- FINANZAS JAVIER — Setup completo para proyecto Supabase NUEVO
-- Pegar TODO esto en el SQL Editor y ejecutar de una sola vez.
-- Incluye: schema v1 + funciones + transfer_match + uber_semana
-- ═══════════════════════════════════════════════════════════

-- ====================================================
-- FINANZAS JAVIER — Schema Supabase v1
-- Zona horaria: America/Santo_Domingo (UTC-4, sin DST)
-- Ejecutar en orden en el SQL Editor de Supabase
-- ====================================================

-- ─── Tipos ────────────────────────────────────────────

CREATE TYPE cuenta_tipo AS ENUM ('bhd', 'qik', 'banreservas', 'ademi', 'efectivo');

-- ─── Tablas ───────────────────────────────────────────

-- Pagos: estado de cada pago del presupuesto mensual
-- Clave natural: (mes_idx, pago_id) — upsert por esta combo
-- mes_idx: 0=Abril, 1=Mayo, 2=Junio, etc.
CREATE TABLE pagos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mes_idx     smallint     NOT NULL CHECK (mes_idx >= 0 AND mes_idx <= 23),
  pago_id     text         NOT NULL,
  nombre      text         NOT NULL,
  monto       numeric(10,2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  cuenta      cuenta_tipo,
  done        boolean      NOT NULL DEFAULT false,
  ts          text,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (mes_idx, pago_id)
);

-- Gastos diarios
CREATE TABLE gastos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descripcion text         NOT NULL,
  categoria   text         NOT NULL DEFAULT 'General',
  monto       numeric(10,2) NOT NULL CHECK (monto >= 0),
  cuenta      cuenta_tipo  NOT NULL,
  notas       text         DEFAULT '',
  timestamp   timestamptz  NOT NULL DEFAULT now(),
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- Entradas / ingresos
CREATE TABLE entradas (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descripcion text         NOT NULL,
  tipo        text         NOT NULL DEFAULT 'Quincena',
  monto       numeric(10,2) NOT NULL CHECK (monto >= 0),
  cuenta      cuenta_tipo  NOT NULL,
  timestamp   timestamptz  NOT NULL DEFAULT now(),
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- Saldos: historial append-only por cuenta
CREATE TABLE saldos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuenta      cuenta_tipo  NOT NULL,
  monto       numeric(10,2) NOT NULL DEFAULT 0,
  timestamp   timestamptz  NOT NULL DEFAULT now(),
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- ─── Vista ────────────────────────────────────────────

-- Saldo más reciente por cuenta
CREATE VIEW saldos_actuales AS
SELECT DISTINCT ON (cuenta)
  cuenta,
  monto,
  timestamp
FROM saldos
ORDER BY cuenta, timestamp DESC;

-- ─── Índices ──────────────────────────────────────────

-- Gastos de hoy (query más frecuente)
CREATE INDEX idx_gastos_timestamp      ON gastos   (timestamp DESC);
CREATE INDEX idx_gastos_cuenta         ON gastos   (cuenta);

-- Entradas del mes actual
CREATE INDEX idx_entradas_timestamp    ON entradas (timestamp DESC);
CREATE INDEX idx_entradas_cuenta       ON entradas (cuenta);

-- Saldos por cuenta (para la vista)
CREATE INDEX idx_saldos_cuenta_ts      ON saldos   (cuenta, timestamp DESC);

-- Pagos por mes (para GET /api/state)
CREATE INDEX idx_pagos_mes_idx         ON pagos    (mes_idx);
CREATE INDEX idx_pagos_mes_done        ON pagos    (mes_idx, done);

-- ─── Trigger updated_at ───────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pagos_updated_at
  BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── RLS ──────────────────────────────────────────────
-- Activamos RLS desde ya. Por ahora políticas permisivas.
-- Cuando llegue Supabase Auth, reemplazar con USING (auth.uid() = owner_id).
-- El service_role bypasses RLS siempre (API Routes en Vercel).
-- El anon key desde cliente no tendrá acceso sin política explícita.

ALTER TABLE pagos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldos   ENABLE ROW LEVEL SECURITY;

-- Políticas temporales: solo service_role accede (cliente no lee directo, todo va por API Route)
-- Para uso futuro con auth: cambiar por USING (auth.uid() IS NOT NULL) o similar

CREATE POLICY "service_role_only" ON pagos    USING (false);
CREATE POLICY "service_role_only" ON gastos   USING (false);
CREATE POLICY "service_role_only" ON entradas USING (false);
CREATE POLICY "service_role_only" ON saldos   USING (false);

-- ─── Funciones ───────────────────────────────────────────

-- ─── RPC: gastos_por_categoria ────────────────────────
-- Devuelve el breakdown de gastos agrupados por categoría
-- para un rango de fechas dado (usado en la pestaña Analytics).
--
-- Parámetros:
--   p_desde  timestamptz  — inicio del rango (ej. primer día del mes, 04:00 UTC = medianoche RD)
--   p_hasta  timestamptz  — fin del rango (ej. primer día del mes siguiente, 04:00 UTC)
--
-- Retorna:
--   categoria  text     — nombre de la categoría
--   total      numeric  — suma de montos en RD$
--   cantidad   bigint   — número de transacciones
--   pct        numeric  — porcentaje del total general (0-100, redondeado a 1 decimal)
--
-- Ejemplo de uso desde la API Route:
--   sb.rpc('gastos_por_categoria', { p_desde: '2026-05-01T04:00:00Z', p_hasta: '2026-06-01T04:00:00Z' })

CREATE OR REPLACE FUNCTION gastos_por_categoria(
  p_desde timestamptz,
  p_hasta timestamptz
)
RETURNS TABLE (
  categoria text,
  total     numeric,
  cantidad  bigint,
  pct       numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      categoria,
      SUM(monto)   AS total,
      COUNT(*)     AS cantidad
    FROM gastos
    WHERE timestamp >= p_desde
      AND timestamp <  p_hasta
    GROUP BY categoria
  ),
  gran_total AS (
    SELECT SUM(total) AS gt FROM base
  )
  SELECT
    b.categoria,
    b.total,
    b.cantidad,
    CASE
      WHEN g.gt = 0 THEN 0
      ELSE ROUND((b.total / g.gt) * 100, 1)
    END AS pct
  FROM base b, gran_total g
  ORDER BY b.total DESC;
$$;

-- ─── transfer_match (match automatico de transferencias BHD) ─
-- Agrega columna transfer_match a pagos.
-- Almacena el nombre del beneficiario al que se transfiere para que el cron de
-- emails pueda hacer match automático cuando detecta una transferencia BHD.
-- Es nullable: pagos sin contrapartida de transferencia dejan la columna en NULL.

ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS transfer_match text;

-- Índice parcial para acelerar las búsquedas ILIKE sobre pagos pendientes.
-- Solo indexa filas con transfer_match definido y done=false (el subconjunto que
-- consulta el cron). pg_trgm requiere la extensión que ya existe en Supabase por defecto.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_pagos_transfer_match_trgm
  ON pagos USING gin (transfer_match gin_trgm_ops)
  WHERE transfer_match IS NOT NULL AND done = false;



-- ─── uber_semana (la usa /api/webhook) ───────────────────
CREATE TABLE IF NOT EXISTS uber_semana (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text          NOT NULL CHECK (tipo IN ('ganancia', 'gasto')),
  monto       numeric(12,2) NOT NULL,
  horas       integer       NOT NULL DEFAULT 0,
  minutos     integer       NOT NULL DEFAULT 0 CHECK (minutos BETWEEN 0 AND 59),
  descripcion text          NOT NULL DEFAULT '',
  fecha       date          NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE uber_semana ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON uber_semana USING (true) WITH CHECK (true);
