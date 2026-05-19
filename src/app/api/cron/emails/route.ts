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

/**
 * Parser para emails de transferencia BHD.
 * From:    Alertas@bhd.com.do
 * Subject: Transacciones entre productos BHD y a otros Bancos
 *
 * Formato del cuerpo (texto plano tras stripHtml):
 *   Monto: RD$ 5,000.00
 *   Beneficiario: MARTINEZ PERALTA, RUTH ESTHER
 *
 * El beneficiario viene en formato "APELLIDO1 [APELLIDO2], NOMBRE1 [NOMBRE2]".
 * Lo invertimos a "Nombre Apellido" para la descripción:
 *   "MARTINEZ PERALTA, RUTH ESTHER" → "Ruth Martinez"
 */
function parseBHDTransferencia(bodyText: string, _attachmentText: string, cuenta: string): ParseResult {
  const text = bodyText
  if (!text) return null

  // Monto: "Monto: RD$ 5,000.00" — el símbolo puede estar pegado o con espacio
  const montoMatch = text.match(/Monto\s*:\s*RD\$\s*([\d,]+\.?\d*)/)
  if (!montoMatch) return null
  const monto = parseAmount(montoMatch[1])

  // Beneficiario: "Beneficiario: APELLIDOS, NOMBRES"
  // El bodyText tiene entidades HTML sin decodificar (ej. "N&uacute;mero") por lo que
  // no podemos usar el campo siguiente como lookahead. En su lugar capturamos el patrón
  // "WORD(S), WORD(S)" directamente — la coma separa apellidos de nombres y el patrón
  // termina con la primera secuencia que no sea letra mayúscula, espacio ni coma.
  const beneficiarioMatch = text.match(/Beneficiario\s*:\s*([A-Z][A-Z\s]+,\s*[A-Z][A-Z\s]+?)(?=\s+[A-Z][a-z&]|\s{2,}|$)/)

  let comercio = 'BHD Transferencia'
  if (beneficiarioMatch) {
    const raw = beneficiarioMatch[1].trim() // "MARTINEZ PERALTA, RUTH ESTHER"
    const [apellidosPart, nombresPart] = raw.split(',').map(s => s.trim())

    // Tomar solo el primer token de cada parte y capitalizar
    const capitalize = (s: string) =>
      s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

    const primerNombre   = capitalize(nombresPart?.split(/\s+/)[0]  ?? '')
    const primerApellido = capitalize(apellidosPart?.split(/\s+/)[0] ?? '')

    if (primerNombre && primerApellido) {
      comercio = `Transferencia · ${primerNombre} ${primerApellido}`
    } else if (primerApellido) {
      comercio = `Transferencia · ${primerApellido}`
    }
  }

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
  {
    query:           'from:Alertas@bhd.com.do subject:"Transacciones entre productos BHD y a otros Bancos" newer_than:2d',
    cuenta:          'bhd',
    needsAttachment: false,
    parse:           (body, att, cuenta) => parseBHDTransferencia(body, att, cuenta),
  },
]

// ── Auto-match de pago por transferencia ─────────────────────────────────────
//
// Cuando el cron detecta un gasto cuya descripción empieza con "Transferencia · ",
// intenta encontrar el pago pendiente correspondiente en la tabla `pagos` para
// marcarlo como done=true automáticamente.
//
// Estrategia de búsqueda (en orden de precisión):
//   1. ILIKE por nombre del beneficiario sobre transfer_match (fuzzy, case-insensitive)
//   2. Si el paso 1 devuelve 0 resultados, fallback por monto exacto en pagos que
//      tengan transfer_match IS NOT NULL (evita falsos positivos en pagos sin nombre)
//
// En ambos casos solo se marca si hay exactamente 1 candidato — 0 o >1 son ambiguos.

async function autoMatchPago(
  sb:       ReturnType<typeof getSupabase>,
  comercio: string,
  monto:    number,
): Promise<void> {
  const PREFIX = 'Transferencia · '
  const beneficiario = comercio.slice(PREFIX.length).trim()
  if (!beneficiario) return

  // ── Paso 1: match por nombre del beneficiario (ILIKE) ────────────────────
  const { data: byNombre, error: err1 } = await sb
    .from('pagos')
    .select('id')
    .eq('done', false)
    .ilike('transfer_match', `%${beneficiario}%`)

  if (err1) {
    console.error('[cron/emails] auto-match byNombre error:', err1.message)
    return
  }

  let candidatos = byNombre ?? []

  // ── Paso 2: fallback por monto exacto (solo si paso 1 no encontró nada) ──
  if (candidatos.length === 0) {
    const { data: byMonto, error: err2 } = await sb
      .from('pagos')
      .select('id')
      .eq('done', false)
      .eq('monto', monto)
      .not('transfer_match', 'is', null)

    if (err2) {
      console.error('[cron/emails] auto-match byMonto error:', err2.message)
      return
    }
    candidatos = byMonto ?? []
  }

  // ── Decisión final ────────────────────────────────────────────────────────
  if (candidatos.length === 1) {
    const { error: updateError } = await sb
      .from('pagos')
      .update({ done: true, updated_at: new Date() })
      .eq('id', candidatos[0].id)

    if (updateError) {
      console.error('[cron/emails] auto-match update error:', updateError.message)
    } else {
      console.log(
        `[cron/emails] auto-match: pago ${candidatos[0].id} done=true` +
        ` — transferencia a "${beneficiario}" RD$${monto}`,
      )
    }
  } else {
    console.log(
      `[cron/emails] auto-match: ${candidatos.length} candidatos` +
      ` para "${beneficiario}" RD$${monto} — omitido (${candidatos.length === 0 ? 'sin match' : 'ambiguo'})`,
    )
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Vercel Cron envía el secret como: Authorization: Bearer <CRON_SECRET>
  // También aceptamos x-cron-secret y ?secret=... para invocación manual.
  const authHeader = req.headers.get('authorization') ?? ''
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const secret = bearerSecret ?? req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ?debug=1 expone bodyText (primeros 300 chars) y razón de SKIPPED/null por mensaje.
  const debugMode = req.nextUrl.searchParams.get('debug') === '1'

  const gmail = getGmail()
  const sb    = getSupabase()
  const inserted: ParsedTx[] = []
  const errors:   string[]   = []
  const skipped:  Array<{ id: string; cuenta: string; reason: string; bodySnippet?: string }> = []

  for (const bank of BANKS) {
    let msgs: Array<{ id?: string | null }> = []
    try {
      const list = await gmail.users.messages.list({ userId: 'me', q: bank.query, maxResults: 20 })
      msgs = list.data.messages ?? []
      console.log(`[cron/emails] ${bank.cuenta}: ${msgs.length} msgs encontrados`)
    } catch (e) {
      const errMsg = `${bank.cuenta}: list error — ${String(e)}`
      errors.push(errMsg)
      console.error(`[cron/emails] ${errMsg}`)
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
        if (partial === SKIPPED) {
          // Determinar razón específica para diagnóstico
          let reason = 'unknown'
          if (/Rechazada|Reversada/i.test(bodyText)) reason = 'reversada/rechazada'
          else if (/\bUS\s+\$[\d,]+\.\d{2}/.test(bodyText)) reason = 'moneda USD'
          skipped.push({
            id:     msg.id!,
            cuenta: bank.cuenta,
            reason,
            ...(debugMode ? { bodySnippet: bodyText.slice(0, 300) } : {}),
          })
          continue
        }

        // null: fallo de parseo real — loguear para diagnóstico
        if (!partial) {
          errors.push(`${bank.cuenta}: no parse — ${msg.id}`)
          if (debugMode) {
            skipped.push({
              id:          msg.id!,
              cuenta:      bank.cuenta,
              reason:      'parse_failed',
              bodySnippet: bodyText.slice(0, 300),
            })
          }
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
        if (dup) {
          skipped.push({ id: msg.id!, cuenta: bank.cuenta, reason: 'duplicate' })
          continue
        }

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

        // Solo descontar saldo si la transacción es reciente (menos de 48h).
        // Para backfills históricos el saldo ya refleja esos gastos — no volver a restar.
        const esReciente = (Date.now() - ts.getTime()) < 48 * 60 * 60 * 1000
        if (esReciente) await descontarSaldo(sb, tx.cuenta, tx.monto)
        inserted.push(tx)

        // ── Auto-match de pago por transferencia ────────────────────────────────
        // Si la descripción empieza con "Transferencia · " buscamos en pagos si
        // existe un registro pendiente cuyo transfer_match coincida con el
        // beneficiario (ILIKE fuzzy) o cuyo monto coincida exactamente (y tenga
        // transfer_match definido — evita falsos positivos en pagos sin nombre).
        // Solo marcamos automáticamente si hay exactamente 1 candidato; 0 o >1
        // son ambiguos y se ignoran para no marcar el pago incorrecto.
        if (tx.comercio.startsWith('Transferencia · ')) {
          await autoMatchPago(sb, tx.comercio, tx.monto)
        }
      } catch (e) {
        errors.push(`${bank.cuenta}: ${String(e)}`)
      }
    }
  }

  console.log(`[cron/emails] DONE — inserted:${inserted.length} errors:${errors.length} skipped:${skipped.length}`)
  if (errors.length) console.error('[cron/emails] errors:', errors)

  return NextResponse.json({
    ok:       true,
    inserted: inserted.length,
    errors,
    detail:   inserted,
    skipped,
  })
}
