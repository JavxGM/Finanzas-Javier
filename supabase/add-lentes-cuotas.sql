-- ====================================================
-- FINANZAS JAVIER — Pagos lentes en 6 cuotas
-- Ejecutar en el SQL Editor de Supabase
-- DESPUÉS de schema.sql, seed.sql y fix-mayo-pagos.sql
-- ====================================================
-- Contexto:
--   Descuento de nomina RD$1,000/quincena durante 3 meses (6 quincenas).
--   Se descuenta de BHD (nomina). Cuota 1 YA COBRADA el 5 junio 2026.
--
-- Tabla de cuotas:
--   Cuota | Quincena trabajada | Fecha de cobro (descuento) | mes_idx
--   1     | 20 mayo            | 5 junio                    | 2 (Junio)
--   2     | 5 junio            | 20 junio                   | 2 (Junio)
--   3     | 20 junio           | 5 julio                    | 3 (Julio)
--   4     | 5 julio            | 20 julio                   | 3 (Julio)
--   5     | 20 julio           | 5 agosto                   | 4 (Agosto)
--   6     | 5 agosto           | 20 agosto                  | 4 (Agosto)
--
-- NOTA sobre mes_idx:
--   0 = Abril 2026, 1 = Mayo 2026, 2 = Junio 2026, 3 = Julio 2026, 4 = Agosto 2026
-- ====================================================

-- 1. pm-lentes (RD$2,000 Mayo, pago por fuera del sueldo) SE MANTIENE — no tocar.
--    Las 6 cuotas son ADICIONALES, descontadas de nómina BHD por quincena.

-- 2. Insertar las 6 cuotas en sus meses correctos
--    Fechas = fechas de COBRO del sueldo (5 y 20 de cada mes)
--    Cuota 1: cobrada el 20 mayo 2026 (ya done=true)
INSERT INTO pagos (mes_idx, pago_id, nombre, monto, cuenta, done)
VALUES
  (1, 'pm-lentes-1', 'Lentes cuota 1/6 · 20 may', 2000.00, 'bhd', true),
  (2, 'pm-lentes-2', 'Lentes cuota 2/6 · 5 jun',  2000.00, 'bhd', false),
  (2, 'pm-lentes-3', 'Lentes cuota 3/6 · 20 jun', 2000.00, 'bhd', false),
  (3, 'pm-lentes-4', 'Lentes cuota 4/6 · 5 jul',  2000.00, 'bhd', false),
  (3, 'pm-lentes-5', 'Lentes cuota 5/6 · 20 jul', 2000.00, 'bhd', false),
  (4, 'pm-lentes-6', 'Lentes cuota 6/6 · 5 ago',  2000.00, 'bhd', false)
ON CONFLICT (mes_idx, pago_id) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      monto  = EXCLUDED.monto,
      cuenta = EXCLUDED.cuenta,
      done   = EXCLUDED.done,
      updated_at = now();

-- 3. Insertar filas base para Junio (mes_idx=2), Julio (3) y Agosto (4)
--    si todavía no existen — pagos recurrentes mensuales.
--    ON CONFLICT DO NOTHING para no sobreescribir datos si ya los creaste manualmente.

-- ── Junio 2026 (mes_idx = 2) ─────────────────────────
INSERT INTO pagos (mes_idx, pago_id, nombre, monto, done) VALUES
  (2, 'pj-ban1',    'Banreservas Q1',               2000.00, false),
  (2, 'pj-gym',     'Gimnasio',                     1850.00, false),
  (2, 'pj-net',     'Internet · Claro',              900.00, false),
  (2, 'pj-crun',    'Crunchyroll',                   250.00, false),
  (2, 'pj-barb1',   'Barberia parte 1',              500.00, false),
  (2, 'pj-carro',   'Pago carro completo',          5007.00, false),
  (2, 'pj-ademi1',  'Ademi cuota 3 · dia 14',       2139.00, false),
  (2, 'pj-qik',     'Qik ahorro',                   5000.00, false),
  (2, 'pj-ban2',    'Banreservas Q2',               2000.00, false),
  (2, 'pj-res',     'Residencial',                  3000.00, false),
  (2, 'pj-barb2',   'Barberia parte 2',              500.00, false),
  (2, 'pj-gas1',    'Gasolina Q1',                  2200.00, false),
  (2, 'pj-gas2',    'Gasolina Q2',                  2200.00, false),
  (2, 'pj-uber',    'Reserva UberDriver',               0.00, false),
  (2, 'pj-trading', 'Reserva Trading',                 0.00, false)
ON CONFLICT (mes_idx, pago_id) DO NOTHING;

-- ── Julio 2026 (mes_idx = 3) ─────────────────────────
INSERT INTO pagos (mes_idx, pago_id, nombre, monto, done) VALUES
  (3, 'pjl-ban1',    'Banreservas Q1',              2000.00, false),
  (3, 'pjl-gym',     'Gimnasio',                    1850.00, false),
  (3, 'pjl-net',     'Internet · Claro',             900.00, false),
  (3, 'pjl-crun',    'Crunchyroll',                  250.00, false),
  (3, 'pjl-barb1',   'Barberia parte 1',             500.00, false),
  (3, 'pjl-carro',   'Pago carro completo',         5007.00, false),
  (3, 'pjl-ademi',   'Ademi cuota 3 · dia 14',      2139.00, false),
  (3, 'pjl-qik',     'Qik ahorro',                  5000.00, false),
  (3, 'pjl-ban2',    'Banreservas Q2',              2000.00, false),
  (3, 'pjl-res',     'Residencial',                 3000.00, false),
  (3, 'pjl-barb2',   'Barberia parte 2',             500.00, false),
  (3, 'pjl-gas1',    'Gasolina Q1',                 2200.00, false),
  (3, 'pjl-gas2',    'Gasolina Q2',                 2200.00, false),
  (3, 'pjl-uber',    'Reserva UberDriver',              0.00, false),
  (3, 'pjl-trading', 'Reserva Trading',                0.00, false)
ON CONFLICT (mes_idx, pago_id) DO NOTHING;

-- ── Agosto 2026 (mes_idx = 4) ────────────────────────
INSERT INTO pagos (mes_idx, pago_id, nombre, monto, done) VALUES
  (4, 'pa-ban1',    'Banreservas Q1',               2000.00, false),
  (4, 'pa-gym',     'Gimnasio',                     1850.00, false),
  (4, 'pa-net',     'Internet · Claro',              900.00, false),
  (4, 'pa-crun',    'Crunchyroll',                   250.00, false),
  (4, 'pa-barb1',   'Barberia parte 1',              500.00, false),
  (4, 'pa-carro',   'Pago carro completo',          5007.00, false),
  (4, 'pa-ademi',   'Ademi cuota 4 · dia 14',       2139.00, false),
  (4, 'pa-qik',     'Qik ahorro',                   5000.00, false),
  (4, 'pa-ban2',    'Banreservas Q2',               2000.00, false),
  (4, 'pa-res',     'Residencial',                  3000.00, false),
  (4, 'pa-barb2',   'Barberia parte 2',             500.00, false),
  (4, 'pa-gas1',    'Gasolina Q1',                  2200.00, false),
  (4, 'pa-gas2',    'Gasolina Q2',                  2200.00, false),
  (4, 'pa-uber',    'Reserva UberDriver',               0.00, false),
  (4, 'pa-trading', 'Reserva Trading',                 0.00, false)
ON CONFLICT (mes_idx, pago_id) DO NOTHING;

-- 4. Verificar resultado de lentes
SELECT mes_idx, pago_id, nombre, monto, done
FROM pagos
WHERE pago_id LIKE '%lentes%'
ORDER BY mes_idx, pago_id;
-- Debe mostrar 7 filas: pm-lentes (Mayo RD$2,000) + pm-lentes-1 a pm-lentes-6 (RD$2,000 c/u)
