/* eslint-disable @typescript-eslint/no-explicit-any */
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

/**
 * Lectura de correo por IMAP con App Password de Gmail.
 *
 * Reemplaza el acceso vía OAuth2 (src/lib/gmail.ts), que fallaba con
 * `invalid_grant`: Google caduca los refresh tokens de apps en modo Testing
 * a los 7 días, así que el cron se moría solo cada semana.
 *
 * El App Password no caduca y ya se usaba para ENVIAR correo (src/lib/mailer.ts),
 * así que no hay credencial nueva que administrar.
 */

export type CorreoLeido = {
  uid:       number
  messageId: string  // header Message-ID, clave estable para idempotencia
  fecha:     Date | null
  asunto:    string
  emisor:    string
  texto:     string  // cuerpo en texto plano (o HTML degradado a texto)
  html:      string  // cuerpo HTML crudo, vacío si no hay
}

function nuevoCliente(): ImapFlow {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    throw new Error('Faltan GMAIL_USER o GMAIL_APP_PASSWORD en el entorno')
  }
  return new ImapFlow({
    host:   'imap.gmail.com',
    port:   993,
    secure: true,
    auth:   { user, pass },
    logger: false,
  })
}

/**
 * Abre una sesión IMAP sobre INBOX, ejecuta `fn` y cierra siempre la conexión.
 */
export async function conInbox<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = nuevoCliente()
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  try {
    return await fn(client)
  } finally {
    lock.release()
    await client.logout().catch(() => {})
  }
}

/**
 * Busca correos por remitente dentro de los últimos `dias` días.
 *
 * IMAP no filtra por asunto de forma fiable entre servidores, así que el filtro
 * de asunto se aplica después en JS sobre lo que devuelve la búsqueda.
 */
export async function buscarCorreos(
  client:  ImapFlow,
  emisor:  string,
  dias:    number,
  asunto?: string,
  limite   = 25,
): Promise<CorreoLeido[]> {
  const since = new Date(Date.now() - dias * 24 * 3600 * 1000)
  const uids = await client.search({ from: emisor, since })
  if (!uids || uids.length === 0) return []

  // Los más recientes primero. El tope existe para la corrida diaria; para
  // reconstruir historial viejo se sube con el parámetro `limite`.
  const seleccion = uids.slice(-limite)
  const salida: CorreoLeido[] = []

  for await (const msg of client.fetch(seleccion, { source: true, envelope: true })) {
    const asuntoMsg = msg.envelope?.subject ?? ''
    if (asunto && !asuntoMsg.toLowerCase().includes(asunto.toLowerCase())) continue

    let texto     = ''
    let html      = ''
    let messageId = ''
    try {
      const parsed = await simpleParser(msg.source as Buffer)
      texto     = parsed.text ?? ''
      html      = typeof parsed.html === 'string' ? parsed.html : ''
      messageId = parsed.messageId ?? ''
      // Si no vino texto plano, degradamos el HTML a texto para los parsers.
      if (!texto && html) texto = htmlATexto(html)
    } catch {
      // Un mensaje ilegible no debe tumbar la corrida completa.
    }

    salida.push({
      uid:       msg.uid,
      messageId: messageId || `uid:${msg.uid}`,
      fecha:     msg.envelope?.date ?? null,
      asunto:    asuntoMsg,
      emisor:    msg.envelope?.from?.[0]?.address ?? '',
      texto,
      html,
    })
  }

  return salida
}

/** Convierte HTML a texto plano conservando los saltos de fila de las tablas. */
export function htmlATexto(html: string): string {
  return html
    // Los correos del BHD traen la hoja de estilos embebida; sin esto el CSS
    // termina dentro del texto y ensucia lo que ven los parsers.
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, ' ')
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(tr|p|div|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*\/\s*(td|th)\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
