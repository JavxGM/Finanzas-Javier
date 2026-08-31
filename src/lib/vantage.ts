import type { ImapFlow } from 'imapflow'
import { buscarCorreos, htmlATexto } from '@/lib/imap'
import { getSupabase } from '@/lib/supabase'

/**
 * Lectura de los correos "Daily Confirmation" de Vantage (MetaTrader 5).
 *
 * Vive aparte de las rutas porque lo llaman dos: el cron de correos, que es el
 * que de verdad corre solo, y /api/cron/inversion para ejecuciones manuales.
 *
 * Por que no tiene cron propio: en el plan Hobby de Vercel no todos los crons
 * declarados llegan a ejecutarse. El de correos si corre, comprobado, asi que
 * la lectura de trading viaja con el en vez de depender de un turno propio.
 */

export const VANTAGE_EMISOR = 'vantage'
export const VANTAGE_ASUNTO = 'Daily Confirmation'

// Los dias anteriores fueron pruebas de Javier y no cuentan.
export const VANTAGE_DESDE = '2026-08-28'

export type Operacion = {
  hora:   string
  tipo:   string   // buy | sell
  size:   number
  item:   string   // XAUUSD, etc
  precio: number
  entry:  string   // in = abre posicion, out = la cierra
  profit: number
}

export type FilaInversion = {
  fecha:       string
  pl:          number
  deposito:    number
  cuenta:      string | null
  operaciones: number
  detalle:     Operacion[]
}

function numero(s: string): number {
  return parseFloat(s.replace(/,/g, ''))
}

/**
 * Extrae la tabla "Deals": cada fila es una operacion.
 *   2026.08.28 18:22:23 178054284 sell 0.02 XAUUSD 4562.03 191981389 out 0.00 0.00 4.94
 * Algunas traen un comentario entre corchetes antes de in/out: [sl 4622.00]
 */
export function parseOperaciones(plano: string): Operacion[] {
  const re = /(\d{4}\.\d{2}\.\d{2})\s+(\d{2}:\d{2}:\d{2})\s+\d+\s+(buy|sell)\s+([\d.]+)\s+([A-Z]{3,10})\s+([\d.]+)\s+\d+\s+(?:\[[^\]]*\]\s+)?(in|out)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s+(-?[\d.,]+)/gi
  const ops: Operacion[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(plano)) !== null) {
    ops.push({
      hora:   m[2],
      tipo:   m[3].toLowerCase(),
      size:   parseFloat(m[4]),
      item:   m[5],
      precio: parseFloat(m[6]),
      entry:  m[7].toLowerCase(),
      profit: parseFloat(m[10].replace(/,/g, '')),
    })
  }
  return ops
}

export function parseVantage(texto: string): FilaInversion | null {
  // El cuerpo llega con asteriscos de formato: "*Closed P/L:* *36.18*"
  const plano = texto.replace(/\*/g, ' ').replace(/\s+/g, ' ')

  const fechaM = plano.match(/(\d{4})\.(\d{2})\.(\d{2})\s+23:59/)
    ?? plano.match(/(\d{4})\.(\d{2})\.(\d{2})/)
  if (!fechaM) return null
  const fecha = `${fechaM[1]}-${fechaM[2]}-${fechaM[3]}`

  // "Total" es el neto del dia: incluye comisiones y swaps. "Closed P/L" solo
  // trae el resultado de las operaciones, asi que Total manda cuando aparece.
  const totalM = plano.match(/\bTotal\s*:?\s*(-?[\d,]+\.?\d*)\s*$/i)
    ?? plano.match(/Additional\s+Operations\s*:?\s*-?[\d,.]+\s+Total\s*:?\s*(-?[\d,]+\.?\d*)/i)
  const plM = totalM ?? plano.match(/Closed\s+P\/L\s*:?\s*(-?[\d,]+\.?\d*)/i)
  if (!plM) return null

  const depM    = plano.match(/Deposit\s*\/\s*Withdrawal\s*:?\s*(-?[\d,]+\.?\d*)/i)
  const cuentaM = plano.match(/A\/C\s*No\s*:?\s*(\d+)/i)

  const detalle = parseOperaciones(plano)

  return {
    fecha,
    pl:          numero(plM[1]),
    deposito:    depM ? numero(depM[1]) : 0,
    cuenta:      cuentaM ? cuentaM[1] : null,
    operaciones: detalle.filter(o => o.entry === 'out').length,
    detalle,
  }
}

/**
 * Lee los correos de Vantage sobre una conexion IMAP ya abierta y guarda cada
 * dia en la tabla `inversion`. La fecha es la llave, asi que reprocesar los
 * mismos correos no duplica nada — y por eso mirar varios dias atras es seguro:
 * si un dia se pierde, la siguiente corrida lo recupera.
 */
export async function procesarVantage(
  client: ImapFlow,
  opciones: { dias?: number; limite?: number; desde?: string } = {},
): Promise<{ leidos: number; guardadas: FilaInversion[]; errores: string[] }> {
  const dias   = opciones.dias   ?? 7
  const limite = opciones.limite ?? 60
  const desde  = opciones.desde  ?? VANTAGE_DESDE

  const sb = getSupabase()
  const guardadas: FilaInversion[] = []
  const errores: string[] = []

  const correos = await buscarCorreos(client, VANTAGE_EMISOR, dias, VANTAGE_ASUNTO, limite)

  for (const c of correos) {
    const texto = c.texto || htmlATexto(c.html)
    const fila = parseVantage(texto)
    if (!fila) { errores.push('vantage sin parsear: ' + (c.fecha?.toISOString().slice(0, 10) ?? c.uid)); continue }
    if (fila.fecha < desde) continue

    const { error } = await sb.from('inversion').upsert({
      fecha:       fila.fecha,
      pl:          fila.pl,
      deposito:    fila.deposito,
      moneda:      'USD',
      cuenta:      fila.cuenta,
      operaciones: fila.operaciones,
      detalle:     fila.detalle,
    }, { onConflict: 'fecha' })

    if (error) errores.push('vantage ' + fila.fecha + ': ' + error.message)
    else guardadas.push(fila)
  }

  return { leidos: correos.length, guardadas, errores }
}
