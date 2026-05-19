-- ====================================================
-- FINANZAS JAVIER — Fix datos Mayo 2026
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de restaurar el proyecto
-- Solo es necesario si ya ejecutaste el seed.sql original (con los montos incorrectos)
-- ====================================================

-- 1. Corregir montos de pagos Mayo que difieren del frontend
UPDATE pagos SET monto = 2003.00 WHERE mes_idx = 1 AND pago_id = 'pm-sam1';
UPDATE pagos SET monto = 5007.00 WHERE mes_idx = 1 AND pago_id = 'pm-carro';
UPDATE pagos SET nombre = 'Internet · Claro' WHERE mes_idx = 1 AND pago_id = 'pm-net';

-- 2. Insertar pm-lentes si no existe (faltaba en seed.sql original)
INSERT INTO pagos (mes_idx, pago_id, nombre, monto, done)
VALUES (1, 'pm-lentes', 'Montura de lentes', 2000.00, false)
ON CONFLICT (mes_idx, pago_id) DO NOTHING;

-- 3. Verificar resultado
SELECT mes_idx, pago_id, nombre, monto, done
FROM pagos
WHERE mes_idx = 1
ORDER BY id;
-- Debe mostrar 16 filas con montos correctos
