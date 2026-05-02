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
//
// Estructura real del email BHD (multipart/related):
//   - part[0]: text/html  — contiene el cuerpo completo con la tabla de transacción
//   - part[1]: application/octet-stream — logo JPEG adjunto (NO contiene datos de transacción)
//
// El parser trabaja exclusivamente sobre bodyText (el HTML stripeado del body).
// El "attachment" es ignorado — es una imagen binaria, no HTML de transacciones.
//
// Formato en texto plano tras stripHtml:
//   "... 01/05/2026 05:35 pm RD $1,850.00 Smart Fit Rep Dom Aprobada ..."
// Columnas de la tabla: Fecha | Moneda | Monto | Comercio | Estado | Tipo

function parseBHD(bodyText: string, _attachmentText: string, cuenta: string): Omit<ParsedTx, 'categoria'> | null {
  // El body siempre tiene el HTML con la tabla de transacciones.
  // El attachment es el logo JPEG — se ignora.
  const text = bodyText
  if (!text) return null

  // Monto: la moneda (RD) y el valor ($X,XXX.XX) están en celdas separadas.
  // Tras stripHtml quedan como "RD $1,850.00" con un espacio entre ellos.
  const montoMatch = text.match(/RD\s+\$([\d,]+\.?\d*)/)
    ?? text.match(/RD\s*\$\s*([\d,]+\.?\d*)/)  // fallback: sin espacio
  if (!montoMatch) return null
  const monto = parseAmount(montoMatch[1])

  // Ignorar transacciones rechazadas — no representan un gasto real.
  if (/Rechazada/i.test(text)) return null

  // Comercio: aparece justo después del monto y antes de "Aprobada"/"Pendiente"
  // Patrón completo en texto plano:
  //   DD/MM/YYYY HH:MM [ap]m RD $X,XXX.XX  COMERCIO  Aprobada
  // Anclamos la búsqueda del comercio al $ del monto.
  const rowMatch = text.match(
    /\$[\d,]+\.?\d*\s+(.+?)\s+(?:Aprobada|Pendiente)/i,
  )
  const comercio = rowMatch ? rowMatch[1].trim().slice(0, 60) : 'BHD Transacción'

  return { monto, comercio, cuenta }
}

function parseAdemi(text: string, cuenta: string): Omit<ParsedTx, 'categoria'> | null {
  const m = text.match(/RD\$\s*([\d,]+\.?\d*)/)
  if (!m) return null
  const monto = parseAmount(m[1])
  // Merchant appears before the date in the table row
  const row = text.match(/([A-Z][A-Z\s&]+?)\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}/)
  const comercio = row ? row[1].trim().slice(0, 60) : 'Ademi Transacción'
  return { monto, comercio, cuenta }
}

function parseQik(text: string, cuenta: string): Omit<ParsedTx, 'categoria'> | null {
  // Formato Qik (visible en snippet): "RD$ 896.50 en CLARO DOMINICANA 0235"
  const m = text.match(/RD\$\s*([\d,]+\.?\d*)\s+en\s+(.+?)(?:\s{2}|[.!]|con\s+tu|$)/i)
  if (!m) return null
  return {
    monto:    parseAmount(m[1]),
    comercio: m[2].trim().slice(0, 60),
    cuenta,
  }
}

function parseBanreservas(text: string, cuenta: string): Omit<ParsedTx, 'categoria'> | null {
  const m = text.match(/DOP\s+([\d,]+\.?\d*)/)
  if (!m) return null
  const monto = parseAmount(m[1])
  // Merchant is after "DOP XX.XX" and before "Aprobada"
  const row = text.match(/DOP\s+[\d,.]+\s+(.+?)\s+Aprobada/i)
  const comercio = row ? row[1].trim().slice(0, 60) : 'Banreservas Transacción'
  return { monto, comercio, cuenta }
}

// ── Configuracion de bancos ───────────────────────────────────────────────────

type BankConfig = {
  query:          string
  cuenta:         string
  needsAttachment: boolean
  parse: (
    bodyText: string,
    attachmentText: string,
    cuenta: string,
  ) => Omit<ParsedTx, 'categoria'> | null
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
    // El list() está fuera del try-catch interno — si falla por credenciales u otro
    // motivo de red, capturamos aquí para no romper el handler completo con 500.
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

        // Para BHD, descargar el attachment HTML y convertirlo a texto plano
        let attachmentText = ''
        if (bank.needsAttachment) {
          const raw = await extractAttachmentText(gmail, msg.id!, payload)
          attachmentText = stripHtml(raw)
        }

        const partial = bank.parse(bodyText, attachmentText, bank.cuenta)
        if (!partial) {
          errors.push(`${bank.cuenta}: no parse — ${msg.id}`)
          continue
        }

        // Categorización local: reglas ordenadas por especificidad, síncrona
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
