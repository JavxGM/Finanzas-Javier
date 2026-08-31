-- Numero de operaciones cerradas en el dia, para el detalle de la pestana.
ALTER TABLE inversion ADD COLUMN IF NOT EXISTS operaciones smallint NOT NULL DEFAULT 0;
