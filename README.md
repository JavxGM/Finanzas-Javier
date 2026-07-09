# Finanzas Javier

PWA personal de finanzas — seguimiento de gastos, pagos fijos, deudas, saldos y análisis con IA.

**Live:** [finanzas-javier.vercel.app](https://finanzas-javier.vercel.app)

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | PWA vanilla JS (`public/index.html`) |
| Backend | Next.js 15 App Router (API Routes) |
| Base de datos | Supabase (PostgreSQL) |
| Deploy | Vercel |
| IA | OpenRouter — Gemma 4 31B |
| Notificaciones Gmail | Google APIs (OAuth2) |

---

## Funcionalidades

- **Inicio** — resumen del mes: saldos, ingresos, gastos y margen disponible
- **Pagos** — plan de compromisos fijos con checkboxes por quincena (Q1/Q2)
- **Registro** — formulario para registrar gastos y entradas manualmente con toggle
- **Analytics** — gráficas de gastos por categoría y mes con navegación de chips
- **Deudas** — seguimiento de préstamos (ADEMI, BHD), cuotas y score crediticio
- **IA** — asistente financiero con análisis automático del mes y chat libre
- **Lista** — wishlist personal con prioridades, precios y toggle de comprado

---

## Estructura del proyecto

```
src/
  app/
    api/
      cron/
        diario/     → resumen diario por email
        emails/     → procesa notificaciones BHD desde Gmail
        semanal/    → reporte semanal
      ia/           → endpoint IA (OpenRouter)
      webhook/      → webhook de Resend
      email-debug/  → debug de parsing de emails
  lib/
    supabase.ts     → cliente Supabase
    gmail.ts        → OAuth2 + lectura de threads
    mailer.ts       → Resend email sender
    categorizar.ts  → auto-categorización de gastos

public/
  index.html        → PWA completa (vanilla JS, ~2100 líneas)

scripts/
  run-cron.mjs      → ejecuta crons manualmente desde local
  verify-app.mjs    → verifica estado de la app

test-deploy.mjs     → Playwright: smoke test de tabs y funcionalidades
test-ia.mjs         → Playwright: test del endpoint IA
```

---

## Base de datos (Supabase)

| Tabla | Descripción |
|---|---|
| `gastos` | Transacciones de gasto con categoría, cuenta y timestamp |
| `entradas` | Ingresos del mes |
| `pagos` | Plan de pagos fijos por quincena (Q1/Q2) |
| `saldos` | Ledger append-only por cuenta |
| `saldos_actuales` | Vista: saldo más reciente por cuenta |
| `uber_semana` | Registro semanal de ingresos Uber |

### Cuentas (`cuenta_tipo` enum)
`bhd` · `qik` · `banreservas` · `ademi` · `efectivo`

---

## Setup local

```bash
npm install
```

Crea `.env.local` con:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
RESEND_API_KEY=...
CRON_SECRET=...
```

```bash
npm run dev
```

---

## Crons (Vercel)

| Endpoint | Schedule | Función |
|---|---|---|
| `/api/cron/emails` | cada hora | Parsea emails BHD → inserta gastos en Supabase |
| `/api/cron/diario` | 9am diario | Email de resumen del día |
| `/api/cron/semanal` | lunes 8am | Reporte semanal |

---

## Tests

```bash
# Smoke test completo (tabs, formularios, Registro, Deudas, Lista, IA)
node test-deploy.mjs

# Test del endpoint IA
node test-ia.mjs
```

Requiere Playwright instalado: `npm install -D playwright && npx playwright install chromium`
