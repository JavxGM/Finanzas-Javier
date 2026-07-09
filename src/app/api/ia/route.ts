import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'google/gemma-4-31b-it:free'

const SYSTEM_PROMPT = `Eres el asistente financiero personal de Javier García, un profesional dominicano.
Tienes acceso a sus finanzas reales: gastos, saldos e ingresos.
Responde en español dominicano, de forma directa y práctica.
Usa RD$ para los montos. Sé conciso pero útil.
Si ves patrones preocupantes, señálalos sin alarmismo.
Cuando hagas análisis, usa listas simples y montos concretos.`

async function buildContext(mesIdx?: number): Promise<string> {
  const sb = getSupabase()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-based

  // Inicio y fin del mes actual
  const desde = new Date(year, month, 1).toISOString()
  const hasta = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

  const [gastosRes, saldosRes, ingresosRes] = await Promise.all([
    sb.from('gastos')
      .select('descripcion, monto, categoria, timestamp')
      .gte('timestamp', desde)
      .lte('timestamp', hasta)
      .order('timestamp', { ascending: false }),
    sb.from('saldos_actuales').select('cuenta, monto'),
    sb.from('entradas')
      .select('descripcion, monto, mes_idx')
      .eq('mes_idx', mesIdx ?? 3)
  ])

  const gastos = gastosRes.data ?? []
  const saldos = saldosRes.data ?? []
  const ingresos = ingresosRes.data ?? []

  const totalGastado = gastos.reduce((s, g) => s + (g.monto ?? 0), 0)

  const porCategoria: Record<string, number> = {}
  for (const g of gastos) {
    const cat = g.categoria ?? 'Sin categoría'
    porCategoria[cat] = (porCategoria[cat] ?? 0) + g.monto
  }

  const catStr = Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, m]) => `  - ${cat}: RD$${m.toLocaleString('es-DO', { maximumFractionDigits: 2 })}`)
    .join('\n')

  const gastosRecientes = gastos.slice(0, 15)
    .map(g => `  - ${g.descripcion ?? 'Sin descripción'} · RD$${g.monto} · ${g.categoria}`)
    .join('\n')

  const saldosStr = saldos
    .map(s => `  - ${s.cuenta}: RD$${Number(s.monto).toLocaleString('es-DO', { maximumFractionDigits: 2 })}`)
    .join('\n')

  const ingresosStr = ingresos.length
    ? ingresos.map(e => `  - ${e.descripcion}: RD$${e.monto}`).join('\n')
    : '  - Nomina BHD ~RD$37,192 (quincenal ×2)'

  return `=== CONTEXTO FINANCIERO DE JAVIER (${now.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })}) ===

SALDOS ACTUALES:
${saldosStr || '  (sin datos)'}

INGRESOS DEL MES:
${ingresosStr}

GASTOS DEL MES (${gastos.length} transacciones · Total: RD$${totalGastado.toLocaleString('es-DO', { maximumFractionDigits: 2 })}):
Por categoría:
${catStr || '  (sin gastos)'}

Últimas transacciones:
${gastosRecientes || '  (ninguna)'}

COMPROMISOS FIJOS JULIO 2026: ~RD$25,146
  - Carro: RD$5,007 · Ademi: RD$2,139 · Qik ahorro: RD$5,000
  - Banreservas: RD$2,000 · Lentes ×2: RD$4,000 · Residencial: RD$3,000
  - Gimnasio: RD$1,850 · Barbería ×2: RD$1,000 · Internet: RD$900 · Crunchyroll: RD$250`
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

  const { mode, message } = await req.json() as { mode: 'analysis' | 'chat', message?: string }

  const context = await buildContext()

  let userMsg: string
  if (mode === 'analysis') {
    userMsg = `Analiza mis finanzas de este mes. Dame:
1. Un diagnóstico rápido (2-3 líneas)
2. En qué estoy gastando más (top 3 categorías)
3. Si voy bien o mal vs mis compromisos fijos
4. 1-2 recomendaciones concretas para lo que queda del mes`
  } else {
    userMsg = message ?? 'Hola'
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://finanzas-javier.vercel.app',
      'X-Title': 'Finanzas Javier'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: context + '\n\n' + userMsg }
      ],
      temperature: 0.4,
      max_tokens: 800
    })
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }

  const data = await res.json() as { choices: { message: { content: string } }[] }
  const reply = data.choices?.[0]?.message?.content ?? '(sin respuesta)'

  return NextResponse.json({ reply })
}
