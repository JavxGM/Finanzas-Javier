-- ====================================================
-- Inversión — resultados diarios de trading (Vantage / MetaTrader 5)
-- ====================================================
--
-- Cada correo "Daily Confirmation" de Vantage trae dos cifras que importan:
--   Closed P/L          → ganancia o pérdida realizada ese día
--   Deposit/Withdrawal  → dinero que entró o salió de la cuenta
--
-- Con esas dos se reconstruye todo: el capital puesto es la suma de depósitos,
-- el resultado es la suma de P/L, y el valor actual es la suma de ambos.
--
-- La fecha es la llave: un día tiene un solo cierre, así que reprocesar los
-- correos nunca duplica nada.

CREATE TABLE IF NOT EXISTS inversion (
  fecha       date          PRIMARY KEY,
  pl          numeric(12,2) NOT NULL DEFAULT 0,
  deposito    numeric(12,2) NOT NULL DEFAULT 0,
  moneda      text          NOT NULL DEFAULT 'USD',
  cuenta      text,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inversion_fecha ON inversion (fecha DESC);

CREATE TRIGGER inversion_updated_at
  BEFORE UPDATE ON inversion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE inversion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON inversion USING (false);
