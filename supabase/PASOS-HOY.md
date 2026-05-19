# PASOS-HOY — Finanzas Javier · 19 mayo 2026

Instrucciones para ejecutar todos los cambios de hoy manualmente.
Sigue el orden exacto — hay dependencias entre los pasos.

---

## PASO 1 — Restaurar Supabase (obligatorio primero)

Tu proyecto Supabase está pausado por inactividad (plan gratuito, 17+ días sin uso).

1. Abre el dashboard: https://supabase.com/dashboard
2. Selecciona tu proyecto (URL: `lsfimaqcyeizuzxurqau.supabase.co`)
3. Si aparece el banner "Project paused", haz clic en **Restore project**
4. Espera 2-3 minutos hasta que el estado cambie a **Active** (ícono verde)
5. Verifica que funciona: abre el SQL Editor y ejecuta `SELECT 1;` — debe devolver resultado

Si el proyecto ya está activo, salta este paso.

---

## PASO 2 — Ejecutar las SQLs en orden

Abre el **SQL Editor** en el dashboard de Supabase y ejecuta los archivos en este orden:

### 2a. Schema y seed base (solo si la BD está vacía)

Si es una BD nueva o recién restaurada sin datos, ejecuta primero:
- `schema.sql` — crea las tablas, índices, vista y políticas RLS
- `seed.sql` — inserta pagos Abril y Mayo iniciales
- `functions.sql` — crea la RPC `gastos_por_categoria`

Si la BD ya tenía datos (se restauró con los datos existentes), salta al paso 2b.

### 2b. Correcciones Mayo (solo si seed.sql ya se ejecutó antes)

Ejecuta `fix-mayo-pagos.sql`:
```
-- Corrige montos de pm-sam1, pm-carro, pm-net y asegura pm-lentes existe
```
Este script es idempotente — si ya lo ejecutaste antes, volverá a aplicar los mismos valores sin daño.

### 2c. Cuotas de lentes y meses futuros (EJECUTAR HOY)

Ejecuta `add-lentes-cuotas.sql`:
- Elimina `pm-lentes` de Mayo (el pago único de RD$2,000 que ya no aplica)
- Inserta `pm-lentes-1` a `pm-lentes-6` en los meses correctos (Junio, Julio, Agosto)
- La cuota 1 queda marcada como `done=true` (ya cobrada hoy, 5 junio)
- Inserta filas base para Junio (mes_idx=2), Julio (3) y Agosto (4) con pagos recurrentes,
  más las entradas de UberDriver y Trading con monto=0 (a completar cuando definas los montos)

Verifica el resultado con las queries al final del script — deben mostrar 6 filas de lentes
y `debe_ser_0 = 0` para la verificación del pago eliminado.

---

## PASO 3 — Actualizar saldos actuales (HACER HOY)

Hoy cobraste la quincena. Actualiza los saldos en la app:

1. Abre la app en https://finanzas-javier.vercel.app (o desde tu Android)
2. Ve a la pestaña **Inicio**
3. Toca cada cuenta y actualiza el saldo real:
   - **BHD**: ingresa el saldo después de recibir la quincena y pagar lo que ya pagaste
   - **Qik**: saldo actual en la app Qik
   - **Banreservas**: saldo actual en Banreservas
   - **Ademi**: debe seguir en ~RD$4,600 menos la cuota 1 (RD$2,139) si ya se cobró

4. En la pestaña **Balance**, registra la entrada de quincena:
   - Monto: RD$18,600 (o el neto que recibiste)
   - Cuenta: BHD
   - Tipo: Quincena / Salario
   - Descripcion: "Quincena 1 · Mayo 2026"

---

## PASO 4 — Marcar la cuota 1 de lentes como pagada

1. Ve a la pestaña **Pagos**
2. Navega al mes **Junio 2026** (flecha derecha desde Mayo)
3. Busca "Lentes cuota 1/6 · Q1 jun" — debería aparecer ya marcada como hecha
   (el SQL la insertó con `done=true`). Si no aparece marcada, tócala y selecciona BHD.

---

## PASO 5 — Redeploy en Vercel

Los cambios de código que se hicieron hoy (bug del cron de Gmail y estructura de meses)
necesitan ser desplegados a Vercel.

### Opción A — Desde terminal (recomendado)
```bash
cd C:/Users/javie/OneDrive/Escritorio/Antigravity/Finanzas-Javier
git add -A
git commit -m "fix: cron auth bearer, lentes 6 cuotas, uber/trading, meses jun-ago"
git push origin main
```
Vercel desplegará automáticamente al detectar el push a main.

### Opción B — Deploy manual desde el dashboard
1. Abre https://vercel.com/dashboard
2. Selecciona el proyecto `finanzas-javier`
3. En la pestaña **Deployments**, haz clic en **Redeploy** en el último deploy

Espera 1-2 minutos hasta que el deployment muestre estado **Ready**.

---

## PASO 6 — Verificar el cron de Gmail

Una vez redesplegado, verifica que el cron funciona:

### Prueba manual inmediata
Abre este URL en el navegador (reemplaza `TU_CRON_SECRET` con el valor real de tu env var):

```
https://finanzas-javier.vercel.app/api/cron/emails?secret=TU_CRON_SECRET
```

La respuesta esperada:
```json
{
  "ok": true,
  "inserted": 0,
  "errors": [],
  "detail": [],
  "skipped": []
}
```

Si ves `"inserted": N` con N > 0, los gastos se registraron. Si ves errores relacionados
con Gmail, revisa las env vars en Vercel (ver sección de env vars abajo).

### Modo debug (si hay errores de parseo)
```
https://finanzas-javier.vercel.app/api/cron/emails?secret=TU_CRON_SECRET&debug=1
```
Esto incluye `bodySnippet` con los primeros 300 caracteres del email para diagnosticar.

---

## PASO 7 — Verificar que los datos cargan correctamente

1. Abre https://finanzas-javier.vercel.app
2. El sync dot debe ponerse verde y mostrar "Sync" en la esquina superior derecha
3. En la pestaña **Pagos**, navega por los meses — deben aparecer:
   - **Mayo**: sin `pm-lentes` (eliminado), 16 pagos
   - **Junio**: aparece "Lentes cuota 1/6" marcada como hecha, más los recurrentes, UberDriver y Trading
   - **Julio**: lentes cuotas 3 y 4, más recurrentes
   - **Agosto**: lentes cuotas 5 y 6, más recurrentes

Si los datos no cargan (sync dot rojo), verifica que Supabase esté activo (Paso 1).

---

## Variables de entorno requeridas en Vercel

Ve a Vercel Dashboard → proyecto → Settings → Environment Variables.
Confirma que están configuradas (no hace falta ver los valores, solo que existan):

| Variable | Usada en | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | webhook GET, Realtime en frontend | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | todas las API routes | Service role key (no anon) |
| `CRON_SECRET` | /api/cron/* | Secret para autenticar los crons |
| `RESEND_API_KEY` | /api/cron/diario y semanal | API key de Resend para emails |
| `RESEND_FROM` | mailer.ts | Dirección remitente (ej. `finanzas@tudominio.com`) |
| `GOOGLE_CLIENT_ID` | /api/cron/emails | OAuth2 app de Google |
| `GOOGLE_CLIENT_SECRET` | /api/cron/emails | OAuth2 secret de Google |
| `GOOGLE_REFRESH_TOKEN` | /api/cron/emails | Refresh token de la cuenta Gmail |

**Si `GOOGLE_REFRESH_TOKEN` expiró o nunca se configuró**, el cron de emails fallará con
`"invalid_grant"` en los errores. En ese caso necesitas regenerar el refresh token:
1. Ve a https://developers.google.com/oauthplayground
2. Configura el scope: `https://www.googleapis.com/auth/gmail.readonly`
3. Autoriza con tu cuenta Google
4. Copia el nuevo refresh token y actualízalo en Vercel

---

## Notas sobre montos de UberDriver y Trading

Las entradas de ahorro (UberDriver y Trading) se crearon con `monto=0` en la BD y con
`monto=0` en el presupuesto del HTML. Una vez definas cuánto quieres apartar por quincena:

1. Edita `public/index.html` — busca las entradas `pj-uber`, `pjl-uber`, `pa-uber`
   (y sus equivalentes de trading) y cambia `monto:0` al monto real
2. Ejecuta un UPDATE en Supabase SQL Editor para los meses que apliquen:
   ```sql
   UPDATE pagos SET monto = 2000.00 WHERE pago_id IN ('pj-uber','pjl-uber','pa-uber');
   UPDATE pagos SET monto = 1000.00 WHERE pago_id IN ('pj-trading','pjl-trading','pa-trading');
   ```
   (ajusta los montos según lo que decidas)
3. Haz redeploy para que el frontend refleje los nuevos totales comprometidos

---

## Resumen de archivos modificados hoy

| Archivo | Tipo | Cambio |
|---|---|---|
| `supabase/add-lentes-cuotas.sql` | Nuevo | INSERT de 6 cuotas de lentes + pagos jun/jul/ago |
| `supabase/PASOS-HOY.md` | Nuevo | Este archivo |
| `public/index.html` | Modificado | Mayo sin pm-lentes; meses 2/3/4 con lentes+ahorro |
| `src/app/api/cron/emails/route.ts` | Modificado | Fix auth: acepta Bearer token de Vercel |
| `src/app/api/cron/diario/route.ts` | Modificado | Fix auth: acepta Bearer token de Vercel |
| `src/app/api/cron/semanal/route.ts` | Modificado | Fix auth: acepta Bearer token de Vercel |

Archivos de sesión anterior ya existentes (verificados sin cambios necesarios):
- `supabase/fix-mayo-pagos.sql` — correcto
- `supabase/functions.sql` — correcto
- `src/app/api/webhook/route.ts` — correcto (503 ya implementado)
