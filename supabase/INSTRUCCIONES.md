# Finanzas Javier — Fase 1: Supabase Setup

## Paso 1 — Crear proyecto en Supabase

1. Ir a https://supabase.com → New project
   - Name: `finanzas-javier`
   - Region: `East US (N. Virginia)` o `South America (São Paulo)` — el más cercano a RD
   - Password: uno fuerte (guardarlo)
2. Esperar que el proyecto se active (~2 min)

## Paso 2 — Aplicar schema

1. En Supabase: **SQL Editor** → **New query**
2. Copiar y pegar el contenido de `schema.sql` → Run
3. Debe mostrar: `Success. No rows returned`

## Paso 3 — Aplicar seed

1. Nueva query en SQL Editor
2. Copiar y pegar `seed.sql` → Run
3. Debe mostrar: `Success. X rows affected`

## Paso 4 — Verificar

1. Nueva query → copiar `verify.sql` → ejecutar query por query
2. Checks críticos:
   - Abril: 17 pagos, RD$31,050
   - Mayo: 16 pagos, RD$29,050
   - saldos_actuales: 4 cuentas con saldos iniciales
   - RLS activo en las 4 tablas

## Paso 5 — Obtener credenciales

En Supabase: **Settings → API**

```env
# Solo para server-side (Vercel API Routes) — NUNCA exponer en cliente
SUPABASE_SERVICE_KEY=eyJ...  (service_role key)

# Seguro para cliente (anon key) — prefijo NEXT_PUBLIC_
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Para los cron jobs de Vercel (generar con: openssl rand -hex 32)
CRON_SECRET=...

# Para Resend (se agrega en Fase 4)
RESEND_API_KEY=re_...
```

## Paso 6 — Reconciliar pagos de Abril

Antes de la migración final, actualizar los pagos que ya están "Hecho" en el Google Sheet:

```sql
-- Ejecutar por cada pago marcado como hecho en el Sheet
-- Reemplazar 'py-ban1' por el id real y ajustar cuenta y ts
UPDATE pagos
SET done = true,
    cuenta = 'bhd',
    ts = '20 abr. 09:30'
WHERE mes_idx = 0 AND pago_id = 'py-ban1';
```

**Bug conocido en el sistema actual:** El Apps Script usa IDs distintos a los del frontend
(`py-banreservas1` vs `py-ban1`). Los pagos marcados en el Sheet solo se guardaban
por nombre de concepto, no por ID. Al migrar, reconciliar manualmente leyendo la hoja
"Presupuesto Abril" y ejecutando los UPDATE correspondientes.

## Próximo paso: Fase 2

Inicializar Next.js 15 en Vercel + configurar env vars + deploy vacío.
