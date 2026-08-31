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

type Fila = { fecha: string; pl: number; deposito: number; cuenta: string | null; operaciones: number }

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

  // En la tabla Deals cada cierre de posicion lleva la marca ' out '.
  const operaciones = (plano.match(/\sout\s/gi) || []).length

  return {
    fecha,
    pl:          numero(plM[1]),
    deposito:    depM ? numero(depM[1]) : 0,
    cuenta:      cuentaM ? cuentaM[1] : null,
    operaciones,
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
