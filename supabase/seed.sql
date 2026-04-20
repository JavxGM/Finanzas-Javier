-- ====================================================
-- FINANZAS JAVIER — Seed inicial v1
-- Ejecutar DESPUÉS de schema.sql
-- ====================================================
-- IMPORTANTE: Los pagos marcados como done=true son
-- los que estaban "Hecho" según el código original del
-- Apps Script (setupAbril). Reconciliar con la hoja
-- "Presupuesto Abril" del Sheet ANTES de la migración final.
-- ====================================================

-- ─── Saldos iniciales ────────────────────────────────
-- Ademi: RD$4,600 (sobrante del préstamo, hardcoded en el frontend)
-- BHD/Qik/Banreservas: 0 hasta que el usuario los actualice en la app

INSERT INTO saldos (cuenta, monto) VALUES
  ('ademi',       4600.00),
  ('bhd',            0.00),
  ('qik',            0.00),
  ('banreservas',    0.00);

-- ─── Pagos Abril 2026 (mes_idx = 0) ─────────────────
-- Quincena 1 · 1-20 abril

INSERT INTO pagos (mes_idx, pago_id, nombre, monto, done) VALUES
  (0, 'py-qik1',  'Qik ahorro Q1',        2500.00, false),  -- Pendiente (recién migrado)
  (0, 'py-ban1',  'Banreservas Q1',        2000.00, false),
  (0, 'py-gym',   'Gimnasio',              1500.00, false),
  (0, 'py-net',   'Internet',               900.00, false),
  (0, 'py-crun',  'Crunchyroll',            250.00, false),
  (0, 'py-sam1',  'SAM parte 1',           2000.00, false),
  (0, 'py-res1',  'Residencial adelanto',  1500.00, false),
  (0, 'py-gas1',  'Gasolina Q1',           2200.00, false),
  (0, 'py-carro', 'Pago carro completo',   5000.00, false),
  (0, 'py-barb1', 'Barberia parte 1',       500.00, false),

-- Quincena 2 · 20 abr - 5 mayo
  (0, 'py-qik2',  'Qik ahorro Q2',         2500.00, false),
  (0, 'py-ban2',  'Banreservas Q2',         2000.00, false),
  (0, 'py-sam2',  'SAM parte 2',            2000.00, false),
  (0, 'py-res2',  'Residencial restante',   1500.00, false),
  (0, 'py-mant',  'Mantenimiento vehiculo', 2000.00, false),
  (0, 'py-barb2', 'Barberia parte 2',        500.00, false),
  (0, 'py-gas2',  'Gasolina Q2',            2200.00, false);

-- ─── Pagos Mayo 2026 (mes_idx = 1) ───────────────────
-- Quincena 1 · cobras dia 5

INSERT INTO pagos (mes_idx, pago_id, nombre, monto, done) VALUES
  (1, 'pm-ban1',  'Banreservas Q1',         2000.00, false),
  (1, 'pm-gym',   'Gimnasio',               1500.00, false),
  (1, 'pm-net',   'Internet',                900.00, false),
  (1, 'pm-crun',  'Crunchyroll',             250.00, false),
  (1, 'pm-sam1',  'SAM parte 1',            2000.00, false),
  (1, 'pm-res1',  'Residencial adelanto',   1500.00, false),
  (1, 'pm-gas1',  'Gasolina Q1',            2200.00, false),
  (1, 'pm-barb1', 'Barberia parte 1',        500.00, false),
  (1, 'pm-carro', 'Pago carro completo',    5000.00, false),

-- Quincena 2 · cobras dia 20
  (1, 'pm-qik',   'Qik ahorro (completo)',  5000.00, false),
  (1, 'pm-ban2',  'Banreservas Q2',         2000.00, false),
  (1, 'pm-sam2',  'SAM parte 2 (ULTIMO)',   2000.00, false),
  (1, 'pm-res2',  'Residencial restante',   1500.00, false),
  (1, 'pm-gas2',  'Gasolina Q2',            2200.00, false),
  (1, 'pm-barb2', 'Barberia parte 2',        500.00, false),
  (1, 'pm-ademi', 'Ademi cuota 1 · dia 14',    0.00, false);
