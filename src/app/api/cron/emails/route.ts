import { NextRequest, NextResponse } from 'next/server'
import { getGmail, extractText, extractAttachmentText } from '@/lib/gmail'
import { getSupabase } from '@/lib/supabase'
import { categorizarGasto } from '@/lib/categorizar'

export const dynamic = 'force-dynamic'

interface ParsedTx {
  monto:     number
  comercio:  string
  cuenta:    string
  categoria: string
}

// Sentinela para transacciones ignoradas a propósito (moneda extranjera, reversadas, etc.)
// El handler las salta silenciosamente sin agregar un error al output.
const SKIPPED = Symbol('SKIPPED')

type ParseResult = Omit<ParsedTx, 'categoria'> | null | typeof SKIPPED

// ── Helpers de saldo ─────────────────────────────────────────────────────────

const VALID_CUENTAS = ['bhd', 'qik', 'banreservas', 'ademi', 'efectivo'] as const
type CuentaTipo = (typeof VALID_CUENTAS)[number]

function isCuentaValida(c: string): c is CuentaTipo {
  return VALID_CUENTAS.includes(c as CuentaTipo)
}

/**
 * Lee el saldo actual de una cuenta desde saldos_actuales,
 * descuenta el monto del gasto e inserta un nuevo registro en saldos.
 * Si la cuenta no tiene saldo previo registrado, el descuento parte de 0
 * (quedará negativo — señal visible en la UI de que falta configurar el saldo).
 */
async function descontarSaldo(
  sb: ReturnType<typeof getSupabase>,
  cuenta: string,
  monto: number,
): Promise<void> {
  if (!isCuentaValida(cuenta)) return

  const { data: actual } = await sb
    .from('saldos_actuales')
    .select('monto')
    .eq('cuenta', cuenta)
    .maybeSingle()

  const saldoActual = actual ? Number(actual.monto) : 0
  const nuevoSaldo  = saldoActual - monto

  await sb.from('saldos').insert({
    cuenta,
    monto:     nuevoSaldo,
    timestamp: new Date(),
  })
}

// ── Helpers de parseo ─────────────────────────────────────────────────────────

function parseAmount(s: string): number {
  return parseFloat(s.replace(/,/g, ''))
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── Parsers ──────────────────────────────────────────────────────────────────
//
// Cada parser recibe el texto plano (ya sin HTML) y la cuenta.
// Retorna ParseResult:
//   - Omit<ParsedTx, 'categoria'>  → transacción válida, insertar en DB
//   - null                         → no se pudo parsear (error real, se loguea)
//   - SKIPPED                      → ignorado a propósito, sin error en el output
//
// Estructura real del email BHD (multipart/related):
//   - part[0]: text/html  — cuerpo completo con tabla de transacción
//   - part[1]: application/octet-stream — logo JPEG (NO contiene datos de transacción)
//
// El parser trabaja exclusivamente sobre bodyText (el HTML stripeado del body).
// El "attachment" es ignorado — es una imagen binaria, no HTML de transacciones.
//
// Formato en texto plano tras stripHtml:
//   "... 01/05/2026 05:35 pm RD $1,850.00 Smart Fit Rep Dom Aprobada ..."
// Columnas de la tabla: Fecha | Moneda | Monto | Comercio | Estado | Tipo

function parseBHD(bodyText: string, _attachmentText: string, cuenta: string): ParseResult {
  const text = bodyText
  if (!text) return null

  // Ignorar transacciones rechazadas o reversadas — no representan un gasto real.
  if (/Rechazada|Reversada/i.test(text)) return SKIPPED

  // Ignorar transacciones en moneda extranjera (US, EUR, etc.) — la app trabaja en RD$.
  // La celda de moneda contiene "US" cuando es dólares y "RD" cuando es pesos dominicanos.
  if (/\bUS\s+\$[\d,]+\.\d{2}/.test(text) && !/\bRD\s+\$[\d,]+\.\d{2}/.test(text)) return SKIPPED

  // Monto: moneda (RD) y valor ($X,XXX.XX) están en celdas HTML separadas.
  // Tras stripHtml quedan como "RD $1,850.00" con un espacio entre ellos.
  const montoMatch = text.match(/RD\s+\$([\d,]+\.?\d*)/)
    ?? text.match(/RD\s*\$\s*([\d,]+\.?\d*)/)  // fallback: sin espacio
  if (!montoMatch) return null
  const monto = parseAmount(montoMatch[1])

  // Comercio: aparece entre el monto ($X,XXX.XX) y la palabra "Aprobada"/"Pendiente"
  const rowMatch = text.match(/\$[\d,]+\.?\d*\s+(.+?)\s+(?:Aprobada|Pendiente)/i)
  const comercio = rowMatch ? rowMatch[1].trim().slice(0, 60) : 'BHD Transacción'

  return { monto, comercio, cuenta }
}

function parseAdemi(text: string, cuenta: string): ParseResult {
  const m = text.match(/RD\$\s*([\d,]+\.?\d*)/)
  if (!m) return null
  const monto = parseAmount(m[1])
  const row = text.match(/([A-Z][A-Z\s&]+?)\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}/)
  const comercio = row ? row[1].trim().slice(0, 60) : 'Ademi Transacción'
  return { monto, comercio, cuenta }
}

function parseQik(text: string, cuenta: string): ParseResult {
  // Formato Qik: "RD$ 896.50 en CLARO DOMINICANA 0235"
  const m = text.match(/RD\$\s*([\d,]+\.?\d*)\s+en\s+(.+?)(?:\s{2}|[.!]|con\s+tu|$)/i)
  if (!m) return null
  return {
    monto:    parseAmount(m[1]),
    comercio: m[2].trim().slice(0, 60),
    cuenta,
  }
}

function parseBanreservas(text: string, cuenta: string): ParseResult {
  const m = text.match(/DOP\s+([\d,]+\.?\d*)/)
  if (!m) return null
  const monto = parseAmount(m[1])
  const row = text.match(/DOP\s+[\d,.]+\s+(.+?)\s+Aprobada/i)
  const comercio = row ? row[1].trim().slice(0, 60) : 'Banreservas Transacción'
  return { monto, comercio, cuenta }
}

// ── Configuracion de bancos ───────────────────────────────────────────────────

type BankConfig = {
  query:           string
  cuenta:          string
  needsAttachment: boolean
  parse: (bodyText: string, attachmentText: string, cuenta: string) => ParseResult
}

const BANKS: BankConfig[] = [
  {
    // El email BHD es multipart/related: text/html con tabla de transacción
    // + application/octet-stream que es el logo JPEG (no contiene datos útiles).
    // No se necesita descargar attachment; todo el contenido está en el body HTML.
    query:           'from:Alertas@bhd.com.do subject:"Notificación de Transacciones" newer_than:2d',
    cuenta:          'bhd',
    needsAttachment: false,
    parse:           (body, att, cuenta) => parseBHD(body, att, cuenta),
  },
  {
    query:           'from:servicioselectronicos@bancoademi.com.do subject:"Aviso Compra en Comercio" newer_than:2d',
    cuenta:          'ademi',
    needsAttachment: false,
    parse:           (body, _att, cuenta) => parseAdemi(body, cuenta),
  },
  {
    query:           'from:notificaciones@qik.do subject:"Usaste tu tarjeta de débito Qik" newer_than:2d',
    cuenta:          'qik',
    needsAttachment: false,
    parse:           (body, _att, cuenta) => parseQik(body, cuenta),
  },
  {
    query:           'from:notificaciones@banreservas.com subject:"Notificaciones Banreservas" newer_than:2d',
    cuenta:          'banreservas',
    needsAttachment: false,
    parse:           (body, _att, cuenta) => parseBanreservas(body, cuenta),
  },
]

// ── Handler principal ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Vercel Cron envía CRON_SECRET como header x-cron-secret automáticamente.
  // También aceptamos ?secret=... para invocación manual con el mismo valor.
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const gmail = getGmail()
  const sb    = getSupabase()
  const inserted: ParsedTx[] = []
  const errors:   string[]   = []

  for (const bank of BANKS) {
    let msgs: Array<{ id?: string | null }> = []
    try {
      const list = await gmail.users.messages.list({ userId: 'me', q: bank.query, maxResults: 20 })
      msgs = list.data.messages ?? []
    } catch (e) {
      errors.push(`${bank.cuenta}: list error — ${String(e)}`)
      continue
    }

    for (const msg of msgs) {
      try {
        const full         = await gmail.users.messages.get({ userId: 'me', id: msg.id! })
        const payload      = full.data.payload as never
        const bodyText     = stripHtml(extractText(payload))
        const internalDate = Number(full.data.internalDate ?? 0)
        const ts           = internalDate ? new Date(internalDate) : new Date()

        let attachmentText = ''
        if (bank.needsAttachment) {
          const raw = await extractAttachmentText(gmail, msg.id!, payload)
          attachmentText = stripHtml(raw)
        }

        const partial = bank.parse(bodyText, attachmentText, bank.cuenta)

        // SKIPPED: transacción ignorada a propósito (divisa extranjera, reversada, etc.)
        if (partial === SKIPPED) continue

        // null: fallo de parseo real — loguear para diagnóstico
        if (!partial) {
          errors.push(`${bank.cuenta}: no parse — ${msg.id}`)
          continue
        }

        const categoria = categorizarGasto(partial.comercio)
        const tx: ParsedTx = { ...partial, categoria }

        // Idempotencia: saltar si este mensaje ya fue procesado
        const { data: dup } = await sb
          .from('gastos')
          .select('id')
          .eq('notas', `gmail:${msg.id}`)
          .maybeSingle()
        if (dup) continue

        const { error } = await sb.from('gastos').insert({
          descripcion: tx.comercio,
          categoria:   tx.categoria,
          monto:       tx.monto,
          cuenta:      tx.cuenta,
          notas:       `gmail:${msg.id}`,
          timestamp:   ts,
        })

        if (error) {
          errors.push(`${bank.cuenta}: db error — ${error.message}`)
          continue
        }

        await descontarSaldo(sb, tx.cuenta, tx.monto)
        inserted.push(tx)
      } catch (e) {
        errors.push(`${bank.cuenta}: ${String(e)}`)
      }
    }
  }

  return NextResponse.json({ ok: true, inserted: inserted.length, errors, detail: inserted })
}
