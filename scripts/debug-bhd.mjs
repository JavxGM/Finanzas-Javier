/**
 * debug-bhd.mjs — Lee el contenido real de un email de BHD para diagnosticar el parser.
 * Usa las credenciales del cliente viejo que tiene refresh token disponible.
 * Ejecutar: node scripts/debug-bhd.mjs
 */
import { google } from 'googleapis'

// Usar las mismas env vars que el cron de producción
// Requiere GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN en el entorno
const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
)
auth.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
})

const gmail = google.gmail({ version: 'v1', auth })

function decode(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractText(payload) {
  if (payload.body?.data) return decode(payload.body.data)
  if (payload.parts) {
    for (const p of payload.parts) {
      if (p.mimeType === 'text/plain' && p.body?.data) return decode(p.body.data)
    }
    for (const p of payload.parts) {
      if (p.mimeType === 'text/html' && p.body?.data) return decode(p.body.data)
      if (p.parts) {
        const t = extractText(p)
        if (t) return t
      }
    }
  }
  return ''
}

function findAttachmentId(payload) {
  if (payload.body?.attachmentId) return payload.body.attachmentId
  if (payload.parts) {
    for (const p of payload.parts) {
      const found = findAttachmentId(p)
      if (found) return found
    }
  }
  return null
}

// IDs de los mensajes que fallan en el cron
const MSG_IDS = [
  '19de5782716f3f03',
  '19de514555a58a3e',
  '19de3c9955f6802f',
]

for (const id of MSG_IDS) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`MESSAGE ID: ${id}`)
  console.log('='.repeat(70))

  const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
  const payload = msg.data.payload

  // Mostrar estructura del payload (mimeTypes de parts)
  console.log('\n--- ESTRUCTURA PAYLOAD ---')
  function printStructure(p, indent = 0) {
    const prefix = '  '.repeat(indent)
    console.log(`${prefix}mimeType: ${p.mimeType ?? '(none)'}  | bodySize: ${p.body?.size ?? 0}  | attachmentId: ${p.body?.attachmentId ? 'YES' : 'no'}  | hasData: ${p.body?.data ? 'YES' : 'no'}`)
    if (p.parts) p.parts.forEach(part => printStructure(part, indent + 1))
  }
  printStructure(payload)

  // Body text
  const bodyText = extractText(payload)
  const strippedBody = bodyText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  console.log('\n--- BODY TEXT (primeros 800 chars) ---')
  console.log(strippedBody.slice(0, 800) || '(vacío)')

  // Attachment
  const attId = findAttachmentId(payload)
  console.log(`\n--- ATTACHMENT ID: ${attId ?? 'ninguno'} ---`)
  if (attId) {
    const attRes = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: id,
      id: attId,
    })
    const attData = attRes.data.data
    if (attData) {
      const attHtml = decode(attData)
      const attStripped = attHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      console.log('\n--- ATTACHMENT HTML RAW (primeros 2000 chars) ---')
      console.log(attHtml.slice(0, 2000))
      console.log('\n--- ATTACHMENT TEXTO PLANO (primeros 2000 chars) ---')
      console.log(attStripped.slice(0, 2000))

      // Test patrones del parser actual
      console.log('\n--- TEST PATRONES ACTUALES ---')
      const montoMatch = attStripped.match(/RD\s*\$\s*([\d,]+\.?\d*)/)
      console.log(`  montoMatch (RD\\s*\\$): ${montoMatch ? montoMatch[1] : 'NO MATCH'}`)
      const rowMatch = attStripped.match(
        /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s+[ap]m\s+RD\s*\$[\d,. ]+\s+(.+?)(?:\s+Aprobada|\s+Rechazada|\s+Pendiente|$)/i,
      )
      console.log(`  rowMatch (fecha+monto+comercio): ${rowMatch ? rowMatch[1].trim() : 'NO MATCH'}`)
    } else {
      console.log('  (attachment data vacío)')
    }
  }
}
