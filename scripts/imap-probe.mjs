// Sonda IMAP — diagnostico de la lectura de correos bancarios.
//
// Verifica que las credenciales de App Password funcionen y lista los correos
// reales de cada banco para comprobar si los remitentes y asuntos que espera
// /api/cron/emails coinciden con lo que Gmail realmente tiene.
//
// Uso: node scripts/imap-probe.mjs

import fs from 'fs'
import { ImapFlow } from 'imapflow'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const REMITENTES = [
  'Alertas@bhd.com.do',
  'servicioselectronicos@bancoademi.com.do',
  'notificaciones@qik.do',
  'notificaciones@banreservas.com',
]

const client = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
  logger: false,
})

try {
  await client.connect()
  console.log('CONEXION IMAP: OK como ' + env.GMAIL_USER)
} catch (e) {
  console.log('CONEXION IMAP FALLO: ' + e.message)
  process.exit(1)
}

const lock = await client.getMailboxLock('INBOX')
try {
  const desde = new Date(Date.now() - 45 * 24 * 3600 * 1000)
  for (const rem of REMITENTES) {
    const uids = await client.search({ from: rem, since: desde })
    const n = uids ? uids.length : 0
    console.log('\n=== ' + rem + ' -> ' + n + ' correos en 45 dias ===')
    if (!n) continue
    for await (const msg of client.fetch(uids.slice(-4), { envelope: true })) {
      const f = msg.envelope.date ? msg.envelope.date.toISOString().slice(0, 10) : '?'
      console.log('  [' + f + '] ' + msg.envelope.subject)
    }
  }
} finally {
  lock.release()
  await client.logout()
}
