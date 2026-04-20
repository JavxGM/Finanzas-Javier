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
