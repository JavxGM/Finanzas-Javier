import { NextRequest, NextResponse } from 'next/server'
import { conInbox, buscarCorreos, htmlATexto } from '@/lib/imap'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Lee los correos "Daily Confirmation" de Vantage y guarda el resultado diario
 * de la cuenta de trading.
 *
 * Cada correo cierra el dia con dos cifras:
 *   Closed P/L          — lo que se gano o perdio ese dia
 *   Deposit/Withdrawal  — lo que entro o salio de la cuenta
 *
 * Con eso se reconstruye todo: capital = suma de depositos, resultado = suma de
 * P/L, valor actual = capital + resultado. La fecha es la llave, asi que
 * reprocesar los correos no duplica nada.
 *
 * Uso: /api/cron/inversion?secret=<CRON_SECRET>&dias=N
 */

const EMISOR = 'vantage'
const ASUNTO = 'Daily Confirmation'

// Corte por defecto: los dias anteriores fueron pruebas. Se mueve con ?desde=
const DESDE_DEFECTO = '2026-08-28'

type Operacion = {
  hora:   string
  tipo:   string   // buy | sell
  size:   number
  item:   string   // XAUUSD, etc
  precio: number
  entry:  string   // in = abre posicion, out = la cierra
  profit: number
}

type Fila = {
  fecha: string
  pl: number
  deposito: number
  cuenta: string | null
  operaciones: number
  detalle: Operacion[]
}

/**
 * Extrae la tabla "Deals" del correo: cada fila es una operacion con su hora,
 * tipo, tamano, instrumento, precio y resultado.
 *
 * Formato de una fila (ya aplanada):
 *   2026.08.28 18:22:23 178054284 sell 0.02 XAUUSD 4562.03 191981389 out 0.00 0.00 4.94
 *
 * Algunas traen un comentario entre corchetes antes de in/out: [sl 4622.00]
 */
function parseOperaciones(plano: string): Operacion[] {
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

function numero(s: string): number {
  return parseFloat(s.replace(/,/g, ''))
}

function parseVantage(texto: string): Fila | null {
  // El cuerpo llega con asteriscos de formato: "*Closed P/L:* *36.18*"
  const plano = texto.replace(/\*/g, ' ').replace(/\s+/g, ' ')

  // Fecha del cierre: "2026.08.28 23:59"
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

  const depM = plano.match(/Deposit\s*\/\s*Withdrawal\s*:?\s*(-?[\d,]+\.?\d*)/i)
  const cuentaM = plano.match(/A\/C\s*No\s*:?\s*(\d+)/i)

  // Cada cierre de posicion lleva entry = "out"; las de "in" solo abren.
  const detalle = parseOperaciones(plano)
  const operaciones = detalle.filter(o => o.entry === 'out').length

  return {
    fecha,
    pl:          numero(plM[1]),
    deposito:    depM ? numero(depM[1]) : 0,
    cuenta:      cuentaM ? cuentaM[1] : null,
    operaciones,
    detalle,
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const secret = bearer ?? req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dias   = Number(req.nextUrl.searchParams.get('dias') ?? 7)
  const limite = Number(req.nextUrl.searchParams.get('limite') ?? 60)
  const desde  = req.nextUrl.searchParams.get('desde') ?? DESDE_DEFECTO

  const sb = getSupabase()
  const guardadas: Fila[] = []
  const errores: string[] = []
  let leidos = 0

  try {
    await conInbox(async client => {
      const correos = await buscarCorreos(client, EMISOR, dias, ASUNTO, limite)
      leidos = correos.length

      for (const c of correos) {
        // El cuerpo util viene en texto plano; si solo hay HTML lo aplanamos.
        const texto = c.texto || htmlATexto(c.html)
        const fila = parseVantage(texto)
        if (!fila) { errores.push('sin parsear: ' + (c.fecha?.toISOString().slice(0, 10) ?? c.uid)); continue }
        if (fila.fecha < desde) continue

        const { error } = await sb.from('inversion').upsert({
          fecha:    fila.fecha,
          pl:       fila.pl,
          deposito: fila.deposito,
          moneda:      'USD',
          cuenta:      fila.cuenta,
          operaciones: fila.operaciones,
          detalle:     fila.detalle,
        }, { onConflict: 'fecha' })

        if (error) errores.push(fila.fecha + ': ' + error.message)
        else guardadas.push(fila)
      }
    })
  } catch (e) {
    errores.push('imap: ' + (e instanceof Error ? e.message : String(e)))
  }

  const pl    = guardadas.reduce((a, f) => a + f.pl, 0)
  const depos = guardadas.reduce((a, f) => a + f.deposito, 0)

  return NextResponse.json({
    ok: true,
    leidos,
    guardadas: guardadas.length,
    resumen: { pl: Number(pl.toFixed(2)), depositos: Number(depos.toFixed(2)) },
    detalle: guardadas,
    errores,
  })
}
