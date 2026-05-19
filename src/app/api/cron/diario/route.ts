import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { sendMail } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Vercel Cron envía el secret como: Authorization: Bearer <CRON_SECRET>
  // También aceptamos x-cron-secret y ?secret=... para invocación manual.
  const authHeader = req.headers.get('authorization') ?? ''
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const secret = bearerSecret ?? req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabase()
  const { data: gastos } = await sb
    .from('gastos')
    .select('*')
    .gte('timestamp', todayStartRD())
    .lt('timestamp', tomorrowStartRD())
    .order('timestamp', { ascending: false })

  if (!gastos || gastos.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: 'sin gastos hoy' })
  }

  const { data: saldosRaw } = await sb.from('saldos_actuales').select('cuenta, monto')
  const saldos: Record<string, number> = { bhd: 0, qik: 0, banreservas: 0, ademi: 4600 }
  for (const s of saldosRaw ?? []) saldos[s.cuenta] = Number(s.monto)

  const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0)
  const fecha = new Date().toLocaleDateString('es-DO', {
    timeZone: 'America/Santo_Domingo', weekday: 'long', day: 'numeric', month: 'long',
  })

  const filas = gastos.map(g => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1e1e28">${g.descripcion}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e1e28;color:#8888a0">${g.categoria}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e1e28;color:#8888a0">${g.cuenta}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e1e28;text-align:right;color:#ff4f6a">-RD$${Number(g.monto).toLocaleString('es-DO')}</td>
    </tr>`).join('')

  const saldosHtml = Object.entries(saldos)
    .map(([c, m]) => `<span style="margin-right:16px"><span style="color:#8888a0">${c}:</span> <strong>RD$${m.toLocaleString('es-DO')}</strong></span>`)
    .join('')

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#0a0a0f;color:#f0f0f5;padding:32px;max-width:600px;margin:0 auto;border-radius:14px">
      <h2 style="margin:0 0 4px;font-size:20px">Gastos de hoy</h2>
      <p style="margin:0 0 24px;color:#8888a0;font-size:14px">${fecha}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="color:#8888a0;font-size:12px;text-transform:uppercase">
            <th style="padding:8px 12px;text-align:left">Descripción</th>
            <th style="padding:8px 12px;text-align:left">Categoría</th>
            <th style="padding:8px 12px;text-align:left">Cuenta</th>
            <th style="padding:8px 12px;text-align:right">Monto</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:12px;font-weight:600">Total del día</td>
            <td style="padding:12px;text-align:right;font-weight:700;color:#ff4f6a;font-size:16px">-RD$${total.toLocaleString('es-DO')}</td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:24px;padding:16px;background:#111118;border-radius:10px;font-size:14px">
        <p style="margin:0 0 8px;color:#8888a0;font-size:12px;text-transform:uppercase">Saldos actuales</p>
        <div>${saldosHtml}</div>
      </div>
    </div>`

  await sendMail(`Gastos ${fecha} — RD$${total.toLocaleString('es-DO')}`, html)
  return NextResponse.json({ ok: true, sent: true, gastos: gastos.length, total })
}

function toRDDate(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
}
function todayStartRD()    { return `${toRDDate(new Date())}T04:00:00.000Z` }
function tomorrowStartRD() {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 1)
  return `${toRDDate(d)}T04:00:00.000Z`
}
