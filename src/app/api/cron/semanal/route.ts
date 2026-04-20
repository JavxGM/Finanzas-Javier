import { NextRequest, NextResponse } from 'next/server'

// Fase 4 — reemplazará enviarResumenSemanal del Apps Script
// Ejecuta: 11:00 UTC lunes = 7 AM lunes America/Santo_Domingo
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // TODO Fase 4: leer datos de Supabase y enviar email con Resend
  console.log('[cron/semanal] triggered', new Date().toISOString())
  return NextResponse.json({ ok: true, message: 'cron semanal — implementación pendiente Fase 4' })
}
