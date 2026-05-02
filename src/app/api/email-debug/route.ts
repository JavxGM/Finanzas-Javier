/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { getGmail, extractText, extractAttachmentText, decodeBody } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

type AnyPart = any

// Inspecciona la estructura MIME del payload de forma recursiva
function summarizePayload(p: AnyPart): unknown {
  return {
    mimeType:        p?.mimeType ?? '(none)',
    hasData:         !!p?.body?.data,
    dataSize:        p?.body?.size ?? 0,
    hasAttachmentId: !!p?.body?.attachmentId,
    attachmentId:    p?.body?.attachmentId ?? null,
    filename:        p?.filename ?? null,
    parts:           p?.parts?.map(summarizePayload) ?? [],
  }
}

// Extrae todos los bodies HTML embebidos (no attachments)
function extractAllHtmlBodies(p: AnyPart): string[] {
  const results: string[] = []
  if (p?.mimeType === 'text/html' && p?.body?.data) {
    results.push(decodeBody(p.body.data))
  }
  if (p?.parts) {
    for (const part of p.parts) {
      results.push(...extractAllHtmlBodies(part))
    }
  }
  return results
}

function getHeader(payload: AnyPart, name: string): string {
  return (payload?.headers ?? []).find((h: AnyPart) => h.name === name)?.value ?? ''
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Acepta ?id=<messageId> para diagnosticar un mensaje específico
  const specificId = req.nextUrl.searchParams.get('id')

  const gmail   = getGmail()
  const results: unknown[] = []

  if (specificId) {
    // Modo diagnóstico: inspección completa de un mensaje específico
    const full    = await gmail.users.messages.get({ userId: 'me', id: specificId, format: 'full' })
    const payload = full.data.payload as AnyPart

    const subject = getHeader(payload, 'Subject')
    const from    = getHeader(payload, 'From')

    const bodyText       = extractText(payload)
    const strippedBody   = bodyText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const rawAttachment  = await extractAttachmentText(gmail, specificId, payload)
    const strippedAtt    = rawAttachment.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const allHtmlBodies  = extractAllHtmlBodies(payload)

    results.push({
      id:                   specificId,
      subject,
      from,
      payloadStructure:     summarizePayload(payload),
      bodyTextLength:       strippedBody.length,
      bodyText:             strippedBody.slice(0, 1000),
      attachmentRawLength:  rawAttachment.length,
      attachmentText:       strippedAtt.slice(0, 2000),
      allHtmlBodiesCount:   allHtmlBodies.length,
      allHtmlBodiesSizes:   allHtmlBodies.map((h) => h.length),
      firstEmbeddedHtmlRaw: allHtmlBodies[0]?.slice(0, 8000) ?? '',
      // Test de los patrones del parser actual
      parserTest: {
        montoOnAtt:   strippedAtt.match(/RD\s*\$\s*([\d,]+\.?\d*)/)?.[1]   ?? 'NO MATCH',
        montoOnBody:  strippedBody.match(/RD\s*\$\s*([\d,]+\.?\d*)/)?.[1]  ?? 'NO MATCH',
        rowOnAtt:     strippedAtt.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s+[ap]m/i)?.[0] ?? 'NO MATCH',
        altRD:        strippedAtt.match(/RD\$\s*([\d,]+\.?\d*)/)?.[1]      ?? 'NO MATCH',
        altDOP:       strippedAtt.match(/DOP\s*([\d,]+\.?\d*)/)?.[1]       ?? 'NO MATCH',
        altNum:       strippedAtt.match(/([\d,]+\.\d{2})/)?.[1]            ?? 'NO MATCH',
      },
    })
  } else {
    // Modo listado: últimos 2 BHD con estructura y preview de attachment
    const list = await gmail.users.messages.list({
      userId:     'me',
      q:          'from:Alertas@bhd.com.do subject:"Notificación de Transacciones" newer_than:3d',
      maxResults: 2,
    })

    for (const msg of list.data.messages ?? []) {
      const full    = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' })
      const payload = full.data.payload as AnyPart

      const bodyText  = extractText(payload)
      const rawAtt    = await extractAttachmentText(gmail, msg.id!, payload)

      results.push({
        id:                msg.id,
        subject:           getHeader(payload, 'Subject'),
        from:              getHeader(payload, 'From'),
        payloadStructure:  summarizePayload(payload),
        bodyLength:        bodyText.length,
        bodyPreview:       bodyText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
        attachmentLength:  rawAtt.length,
        attachmentPreview: rawAtt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
      })
    }
  }

  return NextResponse.json(results, { status: 200 })
}
