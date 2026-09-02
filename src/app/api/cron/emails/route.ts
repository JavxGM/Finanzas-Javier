import { NextRequest, NextResponse } from 'next/server'
import { conInbox, buscarCorreos, type CorreoLeido } from '@/lib/imap'
import { procesarVantage } from '@/lib/vantage'
import { getSupabase } from '@/lib/supabase'
import { categorizarGasto } from '@/lib/categorizar'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
/**
 * Descuenta un gasto del saldo de la cuenta — pero solo si la transacción es
 * POSTERIOR al último saldo registrado.
 *
 * Sin esa condición se produce doble descuento: cuando anotas el saldo leyéndolo
 * de la app del banco, ese número YA incluye las compras del día. Si el cron
 * procesa después los correos de esas mismas compras y vuelve a restarlas, el
 * saldo queda por debajo del real.
 *
 * El saldo registrado es la fuente de verdad al momento en que se anotó, así que
 * solo tiene sentido restar lo que ocurrió después.
 */
async function descontarSaldo(
  sb: ReturnType<typeof getSupabase>,
  cuenta: string,
  monto: number,
  tsTransaccion: Date,
): Promise<void> {
  if (!isCuentaValida(cuenta)) return

  const { data: actual } = await sb
    .from('saldos_actuales')
    .select('monto, timestamp')
    .eq('cuenta', cuenta)
    .maybeSingle()

  if (actual?.timestamp) {
    const tsSaldo = new Date(actual.timestamp as string)
    if (tsTransaccion.getTime() <= tsSaldo.getTime()) {
      console.log(
        `[cron/emails] saldo ${cuenta}: no se descuenta RD$${monto}, la transaccion ` +
        `(${tsTransaccion.toISOString()}) es anterior al saldo anotado (${tsSaldo.toISOString()})`,
      )
      return
    }
  }

  const saldoActual = actual ? Number(actual.monto) : 0
  const nuevoSaldo  = saldoActual - monto

  // El saldo nuevo se sella con la hora de la TRANSACCION, no con la de ahora.
  //
  // Sellarlo con new Date() rompia la corrida: al procesar varios gastos
  // seguidos, el primero dejaba un saldo con hora actual y todos los demas
  // del mismo dia quedaban "antes" de el, asi que la guardia de arriba los
  // saltaba por creerlos ya contabilizados. Solo se descontaba el primero.
  await sb.from('saldos').insert({
    cuenta,
    monto:     nuevoSaldo,
    timestamp: tsTransaccion,
  })
}

// ── Helpers de parseo ─────────────────────────────────────────────────────────

// Tasa para convertir compras en dolares. Sale del deposito real de Javier a
// Vantage: RD$5,938.21 se convirtieron en US$100. Es aproximada, y por eso los
// gastos convertidos quedan marcados con su monto original en dolares.
const TASA_USD = 59.38

function parseAmount(s: string): number {
  return parseFloat(s.replace(/,/g, ''))
}

// Los correos del BHD traen la hoja de estilos embebida. stripHtml solo quita
// etiquetas, así que sin esto el CSS entero queda dentro del texto que ven los
// parsers. No rompe nada, pero ensucia el diagnóstico cuando algo falla.
function sinEstilos(html: string): string {
  return html
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, ' ')
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, ' ')
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

  // Compras en dolares: el banco te las debita en pesos, asi que ignorarlas
  // hacia que el saldo se fuera desviando en silencio. Se convierten con una
  // tasa fija y quedan marcadas para que se sepa que son aproximadas.
  const usdMatch = text.match(/\bUS\s+\$([\d,]+\.\d{2})/)
  if (usdMatch && !/\bRD\s+\$[\d,]+\.\d{2}/.test(text)) {
    const usd = parseAmount(usdMatch[1])
    const rowUSD = text.match(/\$[\d,]+\.?\d*\s+(.+?)\s+(?:Aprobada|Pendiente)/i)
    const nombre = rowUSD ? rowUSD[1].trim().slice(0, 44) : 'Compra en dolares'
    return {
      monto:    Math.round(usd * TASA_USD * 100) / 100,
      comercio: `${nombre} (US$${usd})`,
      cuenta,
    }
  }

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
  emisor: string   // remitente exacto en Gmail
  asunto: string   // fragmento del asunto (filtro en JS, case-insensitive)
  cuenta: string
  parse: (bodyText: string, attachmentText: string, cuenta: string) => ParseResult
}

// Los filtros se aplican por IMAP (remitente) + JS (asunto). Verificado contra
// la bandeja real: los asuntos de abajo son los que efectivamente llegan.
const BANKS: BankConfig[] = [
  {
    emisor: 'Alertas@bhd.com.do',
    asunto: 'Notificación de Transacciones',
    cuenta: 'bhd',
    parse:  (body, att, cuenta) => parseBHD(body, att, cuenta),
  },
  {
    emisor: 'servicioselectronicos@bancoademi.com.do',
    asunto: 'Aviso Compra en Comercio',
    cuenta: 'ademi',
    parse:  (body, _att, cuenta) => parseAdemi(body, cuenta),
  },
  {
    emisor: 'notificaciones@qik.do',
    asunto: 'Usaste tu tarjeta de débito Qik',
    cuenta: 'qik',
    parse:  (body, _att, cuenta) => parseQik(body, cuenta),
  },
  {
    emisor: 'notificaciones@banreservas.com',
    asunto: 'Notificaciones Banreservas',
    cuenta: 'banreservas',
    parse:  (body, _att, cuenta) => parseBanreservas(body, cuenta),
  },
  {
    emisor: 'Alertas@bhd.com.do',
    asunto: 'Transacciones entre productos BHD y a otros Bancos',
    cuenta: 'bhd',
    parse:  (body, att, cuenta) => parseBHDTransferencia(body, att, cuenta),
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
  // ?dias=N amplía la ventana de búsqueda (por defecto 2, igual que el cron diario).
  const dias = Number(req.nextUrl.searchParams.get('dias') ?? 2)
  // Tope de correos por remitente. La corrida diaria no lo necesita; la
  // reconstruccion de historial viejo sube este numero.
  const limite = Number(req.nextUrl.searchParams.get('limite') ?? 25)

  const sb = getSupabase()
  const inserted: ParsedTx[] = []
  const errors:   string[]   = []
  const skipped:  Array<{ id: string; cuenta: string; reason: string; bodySnippet?: string }> = []
  let trading = { leidos: 0, guardadas: 0 }

  try {
    await conInbox(async client => {
      for (const bank of BANKS) {
        let correos: CorreoLeido[] = []
        try {
          correos = await buscarCorreos(client, bank.emisor, dias, bank.asunto, limite)
          console.log(`[cron/emails] ${bank.cuenta} (${bank.asunto}): ${correos.length} msgs`)
        } catch (e) {
          const errMsg = `${bank.cuenta}: search error — ${String(e)}`
          errors.push(errMsg)
          console.error(`[cron/emails] ${errMsg}`)
          continue
        }

        // Del mas viejo al mas nuevo: el saldo se va sellando con la hora de
        // cada transaccion, asi que procesarlas fuera de orden haria que una
        // anterior quedara por detras del saldo ya escrito y se saltara.
        correos.sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0))

        for (const correo of correos) {
          const id = correo.messageId
          try {
            // Los parsers fueron escritos contra el HTML aplanado con stripHtml
            // (espacios colapsados). Preferimos el HTML crudo y caemos al texto
            // plano solo si el correo no trae parte HTML.
            const fuente   = correo.html || correo.texto
            const bodyText = stripHtml(sinEstilos(fuente))
            const ts       = correo.fecha ?? new Date()

            const partial = bank.parse(bodyText, '', bank.cuenta)

            // SKIPPED: transacción ignorada a propósito (divisa extranjera, reversada, etc.)
            if (partial === SKIPPED) {
              let reason = 'unknown'
              if (/Rechazada|Reversada/i.test(bodyText)) reason = 'reversada/rechazada'
              else if (/\bUS\s+\$[\d,]+\.\d{2}/.test(bodyText)) reason = 'moneda USD'
              skipped.push({
                id,
                cuenta: bank.cuenta,
                reason,
                ...(debugMode ? { bodySnippet: bodyText.slice(0, 300) } : {}),
              })
              continue
            }

            // null: fallo de parseo real — loguear para diagnóstico
            if (!partial) {
              errors.push(`${bank.cuenta}: no parse — ${id}`)
              if (debugMode) {
                skipped.push({
                  id,
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
              .eq('notas', `mail:${id}`)
              .maybeSingle()
            if (dup) {
              skipped.push({ id, cuenta: bank.cuenta, reason: 'duplicate' })
              continue
            }

            const { error } = await sb.from('gastos').insert({
              descripcion: tx.comercio,
              categoria:   tx.categoria,
              monto:       tx.monto,
              cuenta:      tx.cuenta,
              notas:       `mail:${id}`,
              timestamp:   ts,
            })

            if (error) {
              errors.push(`${bank.cuenta}: db error — ${error.message}`)
              continue
            }

            // El descuento de saldo lo decide descontarSaldo comparando contra la
            // fecha del último saldo anotado — así no se resta dos veces lo que el
            // saldo manual ya incluía, ni se tocan los backfills históricos.
            await descontarSaldo(sb, tx.cuenta, tx.monto, ts)
            inserted.push(tx)

            // ── Auto-match de pago por transferencia ────────────────────────────
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

      // Los resultados de trading viajan con esta corrida en vez de tener cron
      // propio: en el plan Hobby de Vercel no todos los crons declarados llegan
      // a ejecutarse, y este si corre. Si falla, no debe tumbar los gastos.
      try {
        const v = await procesarVantage(client, { dias, limite: 60 })
        trading = { leidos: v.leidos, guardadas: v.guardadas.length }
        errors.push(...v.errores)
      } catch (e) {
        errors.push('vantage: ' + (e instanceof Error ? e.message : String(e)))
      }
    })
  } catch (e) {
    // Falla de conexión IMAP: sin esto la corrida entera se cae sin explicación.
    errors.push(`imap: ${e instanceof Error ? e.message : String(e)}`)
    console.error('[cron/emails] fallo de conexion IMAP:', e)
  }

  console.log(`[cron/emails] DONE — inserted:${inserted.length} errors:${errors.length} skipped:${skipped.length}`)
  if (errors.length) console.error('[cron/emails] errors:', errors)

  return NextResponse.json({
    ok:       true,
    inserted: inserted.length,
    errors,
    detail:   inserted,
    skipped,
    trading,
  })
}