import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET() {
  try {
    const sb = getSupabase()
    const now = new Date()
    const lastUpdate = now.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })

    // Inicio del historial: 1 de mayo 2026 (primer mes registrado en la app)
    const historialDesde = '2026-05-01T04:00:00.000Z'
    // Inicio del mes actual para la RPC de analytics
    const mesActualDesde = monthStartRD()
    // Fin = mañana para incluir todo el día de hoy
    const mesActualHasta = tomorrowStartRD()

    const [pagosRes, saldosRes, gastosRes, entradasRes, historialRes, analyticsRes, uberRes] = await Promise.all([
      sb.from('pagos').select('mes_idx, pago_id, done, ts, nombre, monto, cuenta'),
      sb.from('saldos_actuales').select('cuenta, monto'),
      sb.from('gastos').select('id, descripcion, categoria, monto, cuenta, notas, timestamp')
        .gte('timestamp', todayStartRD())
        .lt('timestamp', tomorrowStartRD())
        .order('timestamp', { ascending: false }),
      sb.from('entradas').select('*')
        .gte('timestamp', monthStartRD())
        .order('timestamp', { ascending: false }),
      // Historial completo desde mayo 2026 (para Analytics)
      sb.from('gastos').select('id, descripcion, categoria, monto, cuenta, notas, timestamp')
        .gte('timestamp', historialDesde)
        .order('timestamp', { ascending: false })
        .limit(500),
      // Breakdown por categoría del mes actual via RPC
      // gastos_por_categoria puede no existir aún — usamos maybeSingle no aplica aquí,
      // pero sí capturamos el error para que no rompa el resto del estado.
      sb.rpc('gastos_por_categoria', {
        p_desde: mesActualDesde,
        p_hasta: mesActualHasta,
      }),
      // Uber week tracker — últimas 30 entradas ordenadas por fecha desc
      sb.from('uber_semana').select('*').order('fecha', { ascending: false }).limit(30),
    ])

    // Si la query de pagos falla (BD pausada, timeout, RLS mal configurado),
    // devolvemos 503 con mensaje explícito en lugar de datos vacíos silenciosos.
    if (pagosRes.error) {
      console.error('[GET /api/webhook] pagos query failed:', pagosRes.error)
      return NextResponse.json(
        { error: 'db_unavailable', detail: pagosRes.error.message },
        { status: 503, headers: CORS }
      )
    }

    const pagos: Record<string, unknown> = {}
    for (const p of pagosRes.data ?? []) {
      pagos[`${p.mes_idx}_${p.pago_id}`] = {
        done: p.done,
        ts: p.ts ?? '',
        nombre: p.nombre,
        monto: Number(p.monto),
        cuenta: p.cuenta ?? '',
      }
    }

    const saldos: Record<string, number> = { bhd: 0, qik: 0, banreservas: 0, ademi: 0, efectivo: 0 }
    for (const s of saldosRes.data ?? []) {
      saldos[s.cuenta] = Number(s.monto)
    }

    const mapGasto = (g: Record<string, unknown>) => ({
      id:        g.id,
      desc:      g.descripcion,
      categoria: g.categoria,
      monto:     Number(g.monto),
      cuenta:    g.cuenta,
      notas:     g.notas ?? '',
      timestamp: new Date(g.timestamp as string).getTime(),
    })

    const gastosHoy    = (gastosRes.data    ?? []).map(mapGasto)
    const historialMes = (historialRes.data ?? []).map(mapGasto)

    const entradasMes = (entradasRes.data ?? []).map(e => ({
      desc:      e.descripcion,
      tipo:      e.tipo,
      monto:     Number(e.monto),
      cuenta:    e.cuenta,
      timestamp: new Date(e.timestamp).getTime(),
    }))

    // analytics: array de { categoria, total, cantidad, pct }
    const gastosMes = (analyticsRes.data ?? []).map((r: Record<string, unknown>) => ({
      categoria: r.categoria,
      total:     Number(r.total),
      cantidad:  Number(r.cantidad),
      pct:       Number(r.pct),
    }))

    const uberEntradas = (uberRes.data ?? []).map((u: Record<string, unknown>) => ({
      id:          u.id,
      tipo:        u.tipo,
      monto:       Number(u.monto),
      horas:       Number(u.horas),
      minutos:     Number(u.minutos),
      descripcion: u.descripcion,
      fecha:       u.fecha,
    }))

    return NextResponse.json(
      { pagos, saldos, gastosHoy, entradasMes, historialMes, gastosMes, uberEntradas, lastUpdate },
      { headers: CORS }
    )
  } catch (err) {
    console.error('[GET /api/webhook]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: CORS })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const tipo: string = data.tipo ?? 'pago'
    if (tipo === 'gasto')       return registrarGasto(data)
    if (tipo === 'entrada')     return registrarEntrada(data)
    if (tipo === 'saldo')       return registrarSaldo(data)
    if (tipo === 'uber')        return registrarUber(data)
    if (tipo === 'marcar_pago') return marcarPago(data)
    return registrarPago(data)
  } catch (err) {
    console.error('[POST /api/webhook]', err)
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS })
  }
}

async function registrarPago(data: Record<string, unknown>) {
  const sb = getSupabase()
  const mesIdx = Number(data.mesIdx ?? 0)
  const pagoId = String(data.pagoId ?? '')
  const estado  = String(data.estado ?? 'Hecho')
  const cuenta  = String(data.cuenta ?? '')
  const nombre  = String(data.concepto ?? '')
  const done    = estado === 'Hecho'
  const ts      = done
    ? new Date().toLocaleString('es-DO', {
        hour: '2-digit', minute: '2-digit',
        day: 'numeric', month: 'short',
        timeZone: 'America/Santo_Domingo',
      })
    : null

  const { error } = await sb
    .from('pagos')
    .upsert(
      { mes_idx: mesIdx, pago_id: pagoId, nombre, done, ts, cuenta: done ? cuenta.toLowerCase() : null },
      { onConflict: 'mes_idx,pago_id' }
    )

  if (error) console.error('[registrarPago]', error)
  return NextResponse.json({ ok: !error }, { headers: CORS })
}

async function registrarGasto(data: Record<string, unknown>) {
  const { error } = await getSupabase().from('gastos').insert({
    descripcion: String(data.descripcion ?? ''),
    categoria:   String(data.categoria ?? 'General'),
    monto:       Number(data.monto ?? 0),
    cuenta:      String(data.cuenta ?? 'banreservas').toLowerCase(),
    notas:       String(data.notas ?? ''),
    timestamp:   data.timestamp ? new Date(String(data.timestamp)) : new Date(),
  })
  if (error) console.error('[registrarGasto]', error)
  return NextResponse.json({ ok: !error }, { headers: CORS })
}

async function registrarEntrada(data: Record<string, unknown>) {
  const { error } = await getSupabase().from('entradas').insert({
    descripcion: String(data.desc ?? ''),
    tipo:        String(data.tipo_entrada ?? 'Quincena'),
    monto:       Number(data.monto ?? 0),
    cuenta:      String(data.cuenta ?? 'bhd').toLowerCase(),
    timestamp:   new Date(),
  })
  if (error) console.error('[registrarEntrada]', error)
  return NextResponse.json({ ok: !error }, { headers: CORS })
}

async function registrarSaldo(data: Record<string, unknown>) {
  const cuenta = String(data.cuenta ?? '').toLowerCase()
  const valid  = ['bhd', 'qik', 'banreservas', 'ademi', 'efectivo']
  if (!valid.includes(cuenta)) {
    return NextResponse.json({ ok: false, error: 'cuenta inválida' }, { status: 400, headers: CORS })
  }
  const { error } = await getSupabase().from('saldos').insert({
    cuenta,
    monto:     Number(data.monto ?? 0),
    timestamp: new Date(),
  })
  if (error) console.error('[registrarSaldo]', error)
  return NextResponse.json({ ok: !error }, { headers: CORS })
}

async function registrarUber(data: Record<string, unknown>) {
  const { error } = await getSupabase().from('uber_semana').insert({
    tipo:        String(data.uber_tipo ?? 'ganancia'),
    monto:       Number(data.monto ?? 0),
    horas:       Number(data.horas ?? 0),
    minutos:     Number(data.minutos ?? 0),
    descripcion: String(data.descripcion ?? ''),
    fecha:       String(data.fecha ?? new Date().toISOString().slice(0, 10)),
  })
  if (error) console.error('[registrarUber]', error)
  return NextResponse.json({ ok: !error }, { headers: CORS })
}

// marcarPago: marca un pago del plan como done=true (o false si estado='Pendiente')
// A diferencia de registrarPago, NO actualiza saldo de ninguna cuenta — el banco
// ya realizó el débito; aquí solo se actualiza el estado en el plan de pagos.
async function marcarPago(data: Record<string, unknown>) {
  const sb = getSupabase()
  const mesIdx = Number(data.mesIdx ?? 0)
  const pagoId = String(data.pagoId ?? '')
  const nombre = String(data.nombre ?? '')
  const monto  = Number(data.monto ?? 0)
  const done   = String(data.estado ?? 'Hecho') !== 'Pendiente'
  const ts     = done
    ? new Date().toLocaleString('es-DO', {
        hour: '2-digit', minute: '2-digit',
        day: 'numeric', month: 'short',
        timeZone: 'America/Santo_Domingo',
      })
    : null

  const { error } = await sb
    .from('pagos')
    .upsert(
      { mes_idx: mesIdx, pago_id: pagoId, nombre, monto, done, ts, cuenta: null },
      { onConflict: 'mes_idx,pago_id' }
    )

  if (error) console.error('[marcarPago]', error)
  return NextResponse.json({ ok: !error }, { headers: CORS })
}

function toRDDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
}

function todayStartRD():    string { return `${toRDDate(new Date())}T04:00:00.000Z` }
function tomorrowStartRD(): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 1)
  return `${toRDDate(d)}T04:00:00.000Z`
}
function monthStartRD(): string {
  const [year, month] = toRDDate(new Date()).split('-')
  return `${year}-${month}-01T04:00:00.000Z`
}
