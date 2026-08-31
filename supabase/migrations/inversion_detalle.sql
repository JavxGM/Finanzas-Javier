-- Detalle de cada operación del día: hora, tipo, tamaño, instrumento, precio
-- y resultado. Viene de la tabla "Deals" del correo de Vantage.
ALTER TABLE inversion ADD COLUMN IF NOT EXISTS detalle jsonb NOT NULL DEFAULT '[]'::jsonb;
