import { google } from 'googleapis'

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return auth
}

export function getGmail() {
  return google.gmail({ version: 'v1', auth: getAuth() })
}

export function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

export function extractText(payload: GmailPayload): string {
  if (payload.body?.data) return decodeBody(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBody(part.body.data)
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) return decodeBody(part.body.data)
      if (part.parts) {
        const nested = extractText(part)
        if (nested) return nested
      }
    }
  }
  return ''
}

/**
 * Extrae el primer attachment HTML de un payload de Gmail y lo devuelve como texto plano.
 * BHD envía el contenido de la transacción exclusivamente en un adjunto HTML — el body
 * del mensaje viene vacío. Esta función descarga el attachment via Gmail API y decodifica
 * el base64url en texto.
 *
 * Retorna cadena vacía si no hay attachment HTML o si falla la descarga.
 */
export async function extractAttachmentText(
  gmail: ReturnType<typeof getGmail>,
  messageId: string,
  payload: GmailPayload,
): Promise<string> {
  const attachmentId = findAttachmentId(payload)
  if (!attachmentId) return ''

  try {
    const res = await gmail.users.messages.attachments.get({
      userId:     'me',
      messageId,
      id:         attachmentId,
    })
    const data = res.data.data
    if (!data) return ''
    return decodeBody(data)
  } catch {
    return ''
  }
}

/**
 * Recorre el payload recursivamente buscando el primer part con attachmentId
 * cuyo mimeType sea text/html o application/octet-stream (BHD usa ambos según la versión).
 */
function findAttachmentId(payload: GmailPayload): string | null {
  if (payload.body?.attachmentId) return payload.body.attachmentId
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findAttachmentId(part)
      if (found) return found
    }
  }
  return null
}

interface GmailPayload {
  body?: { data?: string; attachmentId?: string }
  parts?: GmailPayload[]
  mimeType?: string
}
