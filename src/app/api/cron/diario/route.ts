import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { sendMail } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

// Sueldo bruto por quincena. Debe coincidir con INGRESO_QUINC del frontend.
const INGRESO_QUINCENA = 18596

// Cuota mensual del prestamo Ademi 2, cobro automatico el dia 21.
const CUOTA_ADEMI = 2358

/**
 * Registra la quincena los dias 5 y 20.
 *
 * No leemos el correo de nomina: llega al correo empresarial, fuera de nuestro
 * alcance. Pero el pago es determinista — dia fijo, monto fijo — asi que se
 * registra por fecha. Es idempotente: si ya existe la entrada de hoy, no hace
 * nada, de modo que da igual cuantas veces corra el cron.
 */
async function registrarQuincena(
  sb: ReturnType<typeof getSupabase>,
  hoyISO: string,
  dia: number,
): Promise<{ registrada: boolean; motivo: string }> {
  if (dia !== 5 && dia !== 20) return { registrada: false, motivo: 'no es dia de pago' }

  const quincena = dia === 5 ? 'Q1' : 'Q2'
  const marca = `nomina:${hoyISO}`

  // No basta con buscar la marca de HOY: la empresa a veces adelanta el pago
  // (paso el 2 de septiembre en vez del 5), y esa quincena ya quedo anotada
  // con otra fecha. Si hubo una en los ultimos 10 dias, esta ya se cobro.
  const hace10dias = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  const { data: reciente } = await sb
    .from('entradas')
    .select('id, descripcion, timestamp')
    .eq('tipo', 'Quincena')
    .gte('timestamp', hace10dias)
    .limit(1)

  if (reciente && reciente.length) {
    return { registrada: false, motivo: 'ya hubo una quincena en los ultimos 10 dias' }
  }

  const { error } = await sb.from('entradas').insert({
    descripcion: marca,
    tipo:        'Quincena',
    monto:       INGRESO_QUINCENA,
    cuenta:      'bhd',
    timestamp:   new Date(),
  })
  if (error) return { registrada: false, motivo: 'error: ' + error.message }

  console.log(`[cron/diario] quincena ${quincena} registrada: RD$${INGRESO_QUINCENA}`)
  return { registrada: true, motivo: quincena }
}

/**
 * El dia 20 revisa que la cuenta Ademi tenga con que cubrir la cuota del 21.
 * Un cobro rebotado en un prestamo pega directo en el score crediticio, que es
 * justo lo que este plan lleva meses construyendo.
 */
async function alertaCuotaAdemi(
  sb: ReturnType<typeof getSupabase>,
  dia: number,
): Promise<string | null> {
  if (dia !== 20) return null

  const { data } = await sb
    .from('saldos_actuales')
    .select('monto')
    .eq('cuenta', 'ademi')
    .maybeSingle()

  const saldo = data ? Number(data.monto) : 0
  if (saldo >= CUOTA_ADEMI) return null

  const falta = CUOTA_ADEMI - saldo
  return `Manana se cobra la cuota Ademi de RD$${CUOTA_ADEMI.toLocaleString('es-DO')} `
    + `y la cuenta tiene RD$${saldo.toLocaleString('es-DO')}. Faltan `
    + `RD$${falta.toLocaleString('es-DO')} — deposita hoy para que no rebote.`
}

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

  const hoyISO = toRDDate(new Date())
  const dia    = Number(hoyISO.slice(8, 10))

  const quincena = await registrarQuincena(sb, hoyISO, dia)
  const alerta   = await alertaCuotaAdemi(sb, dia)

  // Un dia sin gastos no amerita correo, pero una alerta de fondos si.
  if ((!gastos || gastos.length === 0) && !alerta) {
    return NextResponse.json({ ok: true, sent: false, reason: 'sin gastos hoy', quincena })
  }

  const { data: saldosRaw } = await sb.from('saldos_actuales').select('cuenta, monto')
  const saldos: Record<string, number> = { bhd: 0, qik: 0, banreservas: 0, ademi: 4600 }
  for (const s of saldosRaw ?? []) saldos[s.cuenta] = Number(s.monto)

  const lista = gastos ?? []
  const total = lista.reduce((acc, g) => acc + Number(g.monto), 0)
  const fecha = new Date().toLocaleDateString('es-DO', {
    timeZone: 'America/Santo_Domingo', weekday: 'long', day: 'numeric', month: 'long',
  })

  const filas = lista.map(g => `
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
      ${alerta ? `<div style="background:#2a1a0a;border:1px solid #ffb830;border-radius:10px;padding:14px 16px;margin-bottom:20px"><div style="color:#ffb830;font-weight:700;font-size:14px;margin-bottom:4px">Cuota Ademi manana</div><div style="font-size:13px;color:#f0f0f5;line-height:1.5">${alerta}</div></div>` : ''}
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
  return NextResponse.json({ ok: true, sent: true, gastos: lista.length, total, quincena, alerta })
}

function toRDDate(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
}
function todayStartRD()    { return `${toRDDate(new Date())}T04:00:00.000Z` }
function tomorrowStartRD() {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 1)
  return `${toRDDate(d)}T04:00:00.000Z`
}
