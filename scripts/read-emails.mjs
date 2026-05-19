import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { google } from 'googleapis'

// ── Cargar .env.local ─────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath   = resolve(__dirname, '../.env.local')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    let val = trimmed.slice(eqIdx + 1)
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
} catch {
  console.error('No se pudo leer .env.local — asegúrate de estar en el directorio del proyecto')
  process.exit(1)
}

const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']
const missing  = required.filter(k => !process.env[k])
if (missing.length) {
  console.error('Faltan variables de entorno:', missing.join(', '))
  process.exit(1)
}

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
)
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

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
      const t = extractText(p)
      if (t) return t
    }
  }
  return ''
}

// One email per bank
const ids = {
  BHD:         '19dac7d1082a19a9',
  Ademi:       '19d9e2586024edea',
  Qik:         '19d49b4edee53331',
  Banreservas: '19c77795157c8445',
}

for (const [bank, id] of Object.entries(ids)) {
  const msg = await gmail.users.messages.get({ userId: 'me', id })
  const text = extractText(msg.data.payload)
  // Strip HTML tags for readability
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  console.log(`\n========== ${bank} ==========`)
  console.log(plain.slice(0, 1500))
}
