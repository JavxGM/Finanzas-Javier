import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

// GET /api/webhook — reemplaza doGet del Apps Script
export async function GET() {
  try {
    const now = new Date()
    const lastUpdate = now.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })

    const [pagosRes, saldosRes, gastosRes, entradasRes] = await Promise.all([
      supabase.from('pagos').select('mes_idx, pago_id, done, ts, nombre, monto, cuenta'),
      supabase.from('saldos_actuales').select('cuenta, monto'),
      supabase.from('gastos').select('*').filter(
        'timestamp',
        'gte',
        todayStartRD()
      ).filter('timestamp', 'lt', tomorrowStartRD()).order('timestamp', { ascending: false }),
      supabase.from('entradas').select('*').filter(
        'timestamp', 'gte', monthStartRD()
      ).order('timestamp', { ascending: false }),
    ])

    // Pagos: { "mesIdx_pagoId": { done, ts, nombre, monto, cuenta } }
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

    // Saldos: { bhd, qik, banreservas, ademi }
    const saldos: Record<string, number> = { bhd: 0, qik: 0, banreservas: 0, ademi: 4600 }
    for (const s of saldosRes.data ?? []) {
      saldos[s.cuenta] = Number(s.monto)
    }

    // Gastos hoy
    const gastosHoy = (gastosRes.data ?? []).map(g => ({
      desc: g.descripcion,
      categoria: g.categoria,
      monto: Number(g.monto),
      cuenta: g.cuenta,
      timestamp: new Date(g.timestamp).getTime(),
    }))

    // Entradas del mes
    const entradasMes = (entradasRes.data ?? []).map(e => ({
      desc: e.descripcion,
      tipo: e.tipo,
      monto: Number(e.monto),
      cuenta: e.cuenta,
      timestamp: new Date(e.timestamp).getTime(),
    }))

    return NextResponse.json(
      { pagos, saldos, gastosHoy, entradasMes, lastUpdate },
      { headers: CORS }
    )
  } catch (err) {
    console.error('[GET /api/webhook]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: CORS })
  }
}

// POST /api/webhook — reemplaza doPost del Apps Script
export async function POST(req: Request) {
  try {
    const data = await req.json()
    const tipo: string = data.tipo ?? 'pago'

    if (tipo === 'gasto') return registrarGasto(data)
    if (tipo === 'entrada') return registrarEntrada(data)
    if (tipo === 'saldo') return registrarSaldo(data)
    return registrarPago(data)
  } catch (err) {
    console.error('[POST /api/webhook]', err)
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS })
  }
}

// ─── Handlers ────────────────────────────────────────

async function registrarPago(data: Record<string, unknown>) {
  const mesIdx = Number(data.mesIdx ?? 0)
  const pagoId = String(data.pagoId ?? '')
  const estado = String(data.estado ?? 'Hecho')
  const cuenta = String(data.cuenta ?? '')
  const nombre = String(data.concepto ?? '')
  const done = estado === 'Hecho'
  const ts = done
    ? new Date().toLocaleString('es-DO', {
        hour: '2-digit', minute: '2-digit',
        day: 'numeric', month: 'short',
        timeZone: 'America/Santo_Domingo',
      })
    : null

  const { error } = await supabase
    .from('pagos')
    .upsert(
      { mes_idx: mesIdx, pago_id: pagoId, nombre, done, ts, cuenta: done ? cuenta.toLowerCase() : null },
      { onConflict: 'mes_idx,pago_id' }
    )

  if (error) console.error('[registrarPago]', error)
  return NextResponse.json({ ok: !error }, { headers: CORS })
}

async function registrarGasto(data: Record<string, unknown>) {
  const { error } = await supabase.from('gastos').insert({
    descripcion: String(data.descripcion ?? ''),
    categoria: String(data.categoria ?? 'General'),
    monto: Number(data.monto ?? 0),
    cuenta: String(data.cuenta ?? 'banreservas').toLowerCase(),
    notas: String(data.notas ?? ''),
    timestamp: data.timestamp ? new Date(String(data.timestamp)) : new Date(),
  })

  if (error) console.error('[registrarGasto]', error)
  return NextResponse.json({ ok: !error }, { headers: CORS })
}

async function registrarEntrada(data: Record<string, unknown>) {
  // Fixes bug en Apps Script: usaba data.tipo (era "entrada") en vez de data.tipo_entrada
  const { error } = await supabase.from('entradas').insert({
    descripcion: String(data.desc ?? ''),
    tipo: String(data.tipo_entrada ?? data.tipo ?? 'Quincena'),
    monto: Number(data.monto ?? 0),
    cuenta: String(data.cuenta ?? 'bhd').toLowerCase(),
    timestamp: new Date(),
  })

  if (error) console.error('[registrarEntrada]', error)
  return NextResponse.json({ ok: !error }, { headers: CORS })
}

async function registrarSaldo(data: Record<string, unknown>) {
  const cuenta = String(data.cuenta ?? '').toLowerCase()
  const validCuentas = ['bhd', 'qik', 'banreservas', 'ademi', 'efectivo']
  if (!validCuentas.includes(cuenta)) {
    return NextResponse.json({ ok: false, error: 'cuenta inválida' }, { status: 400, headers: CORS })
  }

  const { error } = await supabase.from('saldos').insert({
    cuenta,
    monto: Number(data.monto ?? 0),
    timestamp: new Date(),
  })

  if (error) console.error('[registrarSaldo]', error)
  return NextResponse.json({ ok: !error }, { headers: CORS })
}

// ─── Helpers de timezone ─────────────────────────────

function toRDDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }) // YYYY-MM-DD
}

function todayStartRD(): string {
  return `${toRDDate(new Date())}T04:00:00.000Z` // midnight RD = 04:00 UTC
}

function tomorrowStartRD(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  return `${toRDDate(d)}T04:00:00.000Z`
}

function monthStartRD(): string {
  const rdNow = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' })
  const [year, month] = rdNow.split('-')
  return `${year}-${month}-01T04:00:00.000Z`
}
