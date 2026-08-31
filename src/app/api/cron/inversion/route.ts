import { NextRequest, NextResponse } from 'next/server'
import { conInbox } from '@/lib/imap'
import { procesarVantage, VANTAGE_DESDE } from '@/lib/vantage'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Lectura manual de los resultados de trading.
 *
 * El trabajo de verdad vive en src/lib/vantage.ts y lo dispara el cron de
 * correos, que es el que efectivamente corre en el plan Hobby. Esta ruta queda
 * para forzar una lectura o para reprocesar un rango con ?dias= y ?desde=.
 *
 * Uso: /api/cron/inversion?secret=<CRON_SECRET>&dias=N&desde=YYYY-MM-DD
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const secret = bearer ?? req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dias   = Number(req.nextUrl.searchParams.get('dias') ?? 7)
  const limite = Number(req.nextUrl.searchParams.get('limite') ?? 60)
  const desde  = req.nextUrl.searchParams.get('desde') ?? VANTAGE_DESDE

  try {
    const r = await conInbox(client => procesarVantage(client, { dias, limite, desde }))
    const pl    = r.guardadas.reduce((a, f) => a + f.pl, 0)
    const depos = r.guardadas.reduce((a, f) => a + f.deposito, 0)

    return NextResponse.json({
      ok: true,
      leidos: r.leidos,
      guardadas: r.guardadas.length,
      resumen: { pl: Number(pl.toFixed(2)), depositos: Number(depos.toFixed(2)) },
      detalle: r.guardadas,
      errores: r.errores,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
