-- ====================================================
-- FINANZAS JAVIER — Queries de verificación
-- Ejecutar después de schema.sql + seed.sql
-- ====================================================

-- 1. Verificar tablas creadas
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Debe mostrar: entradas, gastos, pagos, saldos (TABLE) + saldos_actuales (VIEW)

-- 2. Verificar índices
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 3. Contar pagos por mes
SELECT mes_idx, COUNT(*) as total, SUM(monto) as comprometido
FROM pagos
GROUP BY mes_idx
ORDER BY mes_idx;
-- Abril (0): 17 pagos, RD$31,050
-- Mayo (1): 16 pagos, RD$29,050

-- 4. Verificar saldos_actuales (vista)
SELECT * FROM saldos_actuales ORDER BY cuenta;
-- Debe mostrar las 4 cuentas con sus saldos iniciales

-- 5. Verificar constraint de cuenta
-- Este INSERT debe FALLAR (cuenta inválida):
-- INSERT INTO gastos (descripcion, categoria, monto, cuenta) VALUES ('test', 'General', 100, 'invalid');

-- 6. Verificar que RLS está activo
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('pagos', 'gastos', 'entradas', 'saldos');
-- rowsecurity = true en todas

-- 7. Test del contrato de datos — simular respuesta de /api/state
-- Esta query genera el JSON que devolverá la API Route
WITH pagos_mes AS (
  SELECT pago_id, done, ts, nombre, monto, cuenta::text
  FROM pagos
  WHERE mes_idx = 0  -- Abril
),
saldos_json AS (
  SELECT jsonb_object_agg(cuenta::text, monto) as saldos
  FROM saldos_actuales
)
SELECT
  (SELECT jsonb_object_agg(pago_id, jsonb_build_object(
    'done', done,
    'ts', ts,
    'nombre', nombre,
    'monto', monto,
    'cuenta', cuenta
  )) FROM pagos_mes) as pagos,
  (SELECT saldos FROM saldos_json) as saldos;
-- El resultado debe coincidir con el shape que espera el frontend

-- 8. Verificar integridad de claves (deben coincidir con MESES en index.html)
SELECT mes_idx, pago_id, nombre, monto
FROM pagos
ORDER BY mes_idx, id;
