import { NextRequest, NextResponse } from 'next/server'
import { conInbox, buscarCorreos } from '@/lib/imap'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Diagnóstico de la lectura de correo por IMAP.
 *
 * Lista lo que Gmail realmente tiene de cada banco: remitente, asunto, fecha y
 * un fragmento del cuerpo. Sirve para verificar si los filtros que usa
 * /api/cron/emails coinciden con los correos reales.
 *
 * Uso: /api/imap-debug?secret=<CRON_SECRET>&dias=45
 *      &emisor=... para consultar un remitente puntual
 *      &full=1    para ver 1500 caracteres del cuerpo en vez de 300
 */

const EMISORES = [
  'Alertas@bhd.com.do',
  'servicioselectronicos@bancoademi.com.do',
  'notificaciones@qik.do',
  'notificaciones@banreservas.com',
]

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
    ?? req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dias   = Number(req.nextUrl.searchParams.get('dias') ?? 45)
  const uno    = req.nextUrl.searchParams.get('emisor')
  const full   = req.nextUrl.searchParams.get('full') === '1'
  const corte  = full ? 1500 : 300
  const lista  = uno ? [uno] : EMISORES

  try {
    const resultado = await conInbox(async client => {
      const out: Record<string, unknown> = {}
      for (const emisor of lista) {
        const correos = await buscarCorreos(client, emisor, dias)
        out[emisor] = {
          total: correos.length,
          correos: correos.slice(-5).map(c => ({
            fecha:   c.fecha?.toISOString().slice(0, 16) ?? null,
            asunto:  c.asunto,
            tieneTexto: c.texto.length,
            muestra: c.texto.slice(0, corte),
          })),
        }
      }
      return out
    })

    return NextResponse.json({ ok: true, dias, resultado })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
