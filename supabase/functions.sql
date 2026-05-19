-- ====================================================
-- FINANZAS JAVIER — Funciones PostgreSQL
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de schema.sql
-- ====================================================

-- ─── RPC: gastos_por_categoria ────────────────────────
-- Devuelve el breakdown de gastos agrupados por categoría
-- para un rango de fechas dado (usado en la pestaña Analytics).
--
-- Parámetros:
--   p_desde  timestamptz  — inicio del rango (ej. primer día del mes, 04:00 UTC = medianoche RD)
--   p_hasta  timestamptz  — fin del rango (ej. primer día del mes siguiente, 04:00 UTC)
--
-- Retorna:
--   categoria  text     — nombre de la categoría
--   total      numeric  — suma de montos en RD$
--   cantidad   bigint   — número de transacciones
--   pct        numeric  — porcentaje del total general (0-100, redondeado a 1 decimal)
--
-- Ejemplo de uso desde la API Route:
--   sb.rpc('gastos_por_categoria', { p_desde: '2026-05-01T04:00:00Z', p_hasta: '2026-06-01T04:00:00Z' })

CREATE OR REPLACE FUNCTION gastos_por_categoria(
  p_desde timestamptz,
  p_hasta timestamptz
)
RETURNS TABLE (
  categoria text,
  total     numeric,
  cantidad  bigint,
  pct       numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      categoria,
      SUM(monto)   AS total,
      COUNT(*)     AS cantidad
    FROM gastos
    WHERE timestamp >= p_desde
      AND timestamp <  p_hasta
    GROUP BY categoria
  ),
  gran_total AS (
    SELECT SUM(total) AS gt FROM base
  )
  SELECT
    b.categoria,
    b.total,
    b.cantidad,
    CASE
      WHEN g.gt = 0 THEN 0
      ELSE ROUND((b.total / g.gt) * 100, 1)
    END AS pct
  FROM base b, gran_total g
  ORDER BY b.total DESC;
$$;
