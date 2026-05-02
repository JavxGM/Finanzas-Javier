import { NextRequest, NextResponse } from 'next/server'
import { getGmail, extractText, extractAttachmentText, decodeBody } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

// Inspecciona la estructura MIME del payload de forma recursiva
interface PartSummary {
  mimeType: string
  hasData: boolean
  dataSize: number
  hasAttachmentId: boolean
  attachmentId?: string
  filename?: string
  parts?: PartSummary[]
}

function summarizePayload(p: {
  mimeType?: string | null
  body?: { data?: string | null; attachmentId?: string | null; size?: number | null }
  parts?: typeof p[]
  filename?: string | null
}): PartSummary {
  return {
    mimeType:        p.mimeType ?? '(none)',
    hasData:         !!p.body?.data,
    dataSize:        p.body?.size ?? 0,
    hasAttachmentId: !!p.body?.attachmentId,
    attachmentId:    p.body?.attachmentId ?? undefined,
    filename:        p.filename ?? undefined,
    parts:           p.parts?.map(summarizePayload),
  }
}

// Extrae todos los datos base64 embebidos (no attachment) de las parts HTML
function extractAllHtmlBodies(p: {
  mimeType?: string | null
  body?: { data?: string | null }
  parts?: typeof p[]
}): string[] {
  const results: string[] = []
  if (p.mimeType === 'text/html' && p.body?.data) {
    results.push(decodeBody(p.body.data))
  }
  if (p.parts) {
    for (const part of p.parts) {
      results.push(...extractAllHtmlBodies(part))
    }
  }
  return results
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Acepta ?id=<messageId> para diagnosticar un mensaje específico
  const specificId = req.nextUrl.searchParams.get('id')

  const gmail = getGmail()
  const results: Record<string, unknown>[] = []

  if (specificId) {
    // Modo diagnóstico: inspección completa de un mensaje específico
    const full    = await gmail.users.messages.get({ userId: 'me', id: specificId, format: 'full' })
    const payload = full.data.payload as never
    const subject = (full.data.payload?.headers ?? []).find((h: {name?: string}) => h.name === 'Subject')?.value ?? ''
    const from    = (full.data.payload?.headers ?? []).find((h: {name?: string}) => h.name === 'From')?.value ?? ''

    const bodyText  = extractText(payload)
    const strippedBody = bodyText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const rawAttachment = await extractAttachmentText(gmail, specificId, payload)
    const strippedAtt   = rawAttachment.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const allHtmlBodies = extractAllHtmlBodies(full.data.payload as never)

    results.push({
      id:               specificId,
      subject,
      from,
      payloadStructure: summarizePayload(full.data.payload as never),
      bodyText:         strippedBody.slice(0, 1000),
      bodyTextLength:   strippedBody.length,
      attachmentRawLength: rawAttachment.length,
      attachmentText:   strippedAtt.slice(0, 2000),
      allHtmlBodiesCount: allHtmlBodies.length,
      allHtmlBodiesSizes: allHtmlBodies.map(h => h.length),
      // Muestra el HTML crudo del primer body HTML embebido (no attachment)
      firstEmbeddedHtmlRaw: allHtmlBodies[0]?.slice(0, 3000) ?? '',
      // Test de los patrones del parser actual sobre el attachment
      parserTest: {
        montoMatchOnAtt:    strippedAtt.match(/RD\s*\$\s*([\d,]+\.?\d*)/)?.[1] ?? 'NO MATCH',
        montoMatchOnBody:   strippedBody.match(/RD\s*\$\s*([\d,]+\.?\d*)/)?.[1] ?? 'NO MATCH',
        rowMatchOnAtt:      strippedAtt.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s+[ap]m/i)?.[0] ?? 'NO MATCH',
        // Prueba patrones alternativos de monto
        altMontoRD:         strippedAtt.match(/RD\$\s*([\d,]+\.?\d*)/)?.[1] ?? 'NO MATCH',
        altMontoDOP:        strippedAtt.match(/DOP\s*([\d,]+\.?\d*)/)?.[1] ?? 'NO MATCH',
        altMontoNum:        strippedAtt.match(/([\d,]+\.\d{2})/)?.[1] ?? 'NO MATCH',
      },
    })
  } else {
    // Modo listado: muestra los últimos 2 emails de BHD
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:Alertas@bhd.com.do subject:"Notificación de Transacciones" newer_than:3d',
      maxResults: 2,
    })

    for (const msg of list.data.messages ?? []) {
      const full    = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' })
      const payload = full.data.payload as never
      const subject = (full.data.payload?.headers ?? []).find((h: {name?: string}) => h.name === 'Subject')?.value ?? ''
      const from    = (full.data.payload?.headers ?? []).find((h: {name?: string}) => h.name === 'From')?.value ?? ''
      const body    = extractText(payload)
      const rawAtt  = await extractAttachmentText(gmail, msg.id!, payload)

      results.push({
        id:                  msg.id,
        subject,
        from,
        payloadStructure:    summarizePayload(full.data.payload as never),
        bodyLength:          body.length,
        bodyPreview:         body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
        attachmentLength:    rawAtt.length,
        attachmentPreview:   rawAtt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
      })
    }
  }

  return NextResponse.json(results, { status: 200 })
}
