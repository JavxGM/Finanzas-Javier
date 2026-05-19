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
