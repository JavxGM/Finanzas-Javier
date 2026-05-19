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

-- ── Seed: pagos conocidos con beneficiario de transferencia ───────────────────
-- SAM = Alexandra Pinales (deuda cuotas quincenales)
-- Se usa pago_id como identificador estable; mes_idx 0 = Abril, 1 = Mayo.

UPDATE pagos SET transfer_match = 'Alexandra Pinales'
  WHERE pago_id IN ('pm-sam1', 'pm-sam2', 'py-sam1', 'py-sam2');
