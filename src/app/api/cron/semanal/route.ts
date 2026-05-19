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
  const weekStart = weekStartRD()
  const todayEnd  = tomorrowStartRD()

  const [{ data: gastos }, { data: entradas }, { data: pagos }, { data: saldosRaw }] = await Promise.all([
    sb.from('gastos').select('*').gte('timestamp', weekStart).lt('timestamp', todayEnd).order('timestamp', { ascending: false }),
    sb.from('entradas').select('*').gte('timestamp', weekStart).lt('timestamp', todayEnd).order('timestamp', { ascending: false }),
    sb.from('pagos').select('*').eq('done', true).gte('ts', '').order('mes_idx'),
    sb.from('saldos_actuales').select('cuenta, monto'),
  ])

  const saldos: Record<string, number> = { bhd: 0, qik: 0, banreservas: 0, ademi: 4600 }
  for (const s of saldosRaw ?? []) saldos[s.cuenta] = Number(s.monto)

  const totalGastos  = (gastos ?? []).reduce((a, g) => a + Number(g.monto), 0)
  const totalEntradas = (entradas ?? []).reduce((a, e) => a + Number(e.monto), 0)
  const pagosDone    = pagos ?? []

  // Gastos agrupados por categoría
  const porCategoria: Record<string, number> = {}
  for (const g of gastos ?? []) {
    porCategoria[g.categoria] = (porCategoria[g.categoria] ?? 0) + Number(g.monto)
  }
  const catRows = Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, monto]) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #1e1e28">${cat}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #1e1e28;text-align:right;color:#ff4f6a">-RD$${monto.toLocaleString('es-DO')}</td>
      </tr>`).join('')

  const entradasRows = (entradas ?? []).map(e => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #1e1e28">${e.descripcion}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #1e1e28;color:#8888a0">${e.tipo}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #1e1e28;text-align:right;color:#00e5a0">+RD$${Number(e.monto).toLocaleString('es-DO')}</td>
    </tr>`).join('')

  const pagosRows = pagosDone.map(p => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #1e1e28">${p.nombre}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #1e1e28;color:#8888a0">${p.cuenta ?? ''}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #1e1e28;text-align:right;color:#ff4f6a">-RD$${Number(p.monto).toLocaleString('es-DO')}</td>
    </tr>`).join('')

  const saldosHtml = Object.entries(saldos)
    .map(([c, m]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1e1e28">
        <span style="color:#8888a0;text-transform:capitalize">${c}</span>
        <strong>RD$${m.toLocaleString('es-DO')}</strong>
      </div>`).join('')

  const semana = `semana del ${new Date(weekStart).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', day: 'numeric', month: 'short' })}`

  const section = (title: string, color: string, body: string) => `
    <div style="margin-bottom:28px">
      <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;color:${color};letter-spacing:.05em">${title}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${body}</table>
    </div>`

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#0a0a0f;color:#f0f0f5;padding:32px;max-width:620px;margin:0 auto;border-radius:14px">
      <h2 style="margin:0 0 4px;font-size:22px">Resumen semanal</h2>
      <p style="margin:0 0 28px;color:#8888a0;font-size:14px">${semana}</p>

      <div style="display:flex;gap:16px;margin-bottom:28px;flex-wrap:wrap">
        <div style="flex:1;min-width:140px;background:#111118;border-radius:10px;padding:16px">
          <p style="margin:0 0 4px;font-size:12px;color:#8888a0;text-transform:uppercase">Gastos</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#ff4f6a">-RD$${totalGastos.toLocaleString('es-DO')}</p>
        </div>
        <div style="flex:1;min-width:140px;background:#111118;border-radius:10px;padding:16px">
          <p style="margin:0 0 4px;font-size:12px;color:#8888a0;text-transform:uppercase">Entradas</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#00e5a0">+RD$${totalEntradas.toLocaleString('es-DO')}</p>
        </div>
        <div style="flex:1;min-width:140px;background:#111118;border-radius:10px;padding:16px">
          <p style="margin:0 0 4px;font-size:12px;color:#8888a0;text-transform:uppercase">Pagos hechos</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#4f9eff">${pagosDone.length}</p>
        </div>
      </div>

      ${catRows    ? section('Gastos por categoría', '#ff4f6a', catRows)    : ''}
      ${entradasRows ? section('Entradas', '#00e5a0', entradasRows)         : ''}
      ${pagosRows  ? section('Pagos del mes', '#4f9eff', pagosRows)         : ''}

      <div style="background:#111118;border-radius:10px;padding:16px;font-size:14px">
        <p style="margin:0 0 12px;font-size:12px;color:#8888a0;text-transform:uppercase">Saldos actuales</p>
        ${saldosHtml}
      </div>
    </div>`

  await sendMail(`Resumen semanal — gastos RD$${totalGastos.toLocaleString('es-DO')}`, html)
  return NextResponse.json({ ok: true, sent: true, gastos: gastos?.length, entradas: entradas?.length, pagos: pagosDone.length })
}

function toRDDate(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
}
function tomorrowStartRD() {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 1)
  return `${toRDDate(d)}T04:00:00.000Z`
}
function weekStartRD() {
  const now = new Date()
  const rdDateStr = toRDDate(now)
  const rdDate = new Date(rdDateStr + 'T04:00:00.000Z')
  const day = rdDate.getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  rdDate.setUTCDate(rdDate.getUTCDate() - diff)
  return rdDate.toISOString().slice(0, 10) + 'T04:00:00.000Z'
}
