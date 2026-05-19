/**
 * read-bhd-emails.mjs
 *
 * Lee emails de BHD de los últimos 30 días desde Gmail y extrae
 * las transacciones usando la misma lógica que parseBHD en route.ts.
 *
 * Uso:
 *   node scripts/read-bhd-emails.mjs
 *
 * Requiere en .env.local:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 */

import { readFileSync } from 'fs'
import { google } from 'googleapis'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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
    // Quitar comillas si las hay
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

// ── Validar credenciales ──────────────────────────────────────────────────────

const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']
const missing  = required.filter(k => !process.env[k])
if (missing.length) {
  console.error('Faltan variables de entorno:', missing.join(', '))
  process.exit(1)
}

// ── OAuth2 + Gmail ────────────────────────────────────────────────────────────

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
)
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

const gmail = google.gmail({ version: 'v1', auth })

// ── Helpers (replicados de src/lib/gmail.ts y route.ts) ──────────────────────

function decodeBody(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractText(payload) {
  if (payload.body?.data) return decodeBody(payload.body.data)
  if (payload.parts) {
    // Primero buscar text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBody(part.body.data)
    }
    // Luego text/html o partes anidadas
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

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseAmount(s) {
  return parseFloat(s.replace(/,/g, ''))
}

/**
 * Replica exacta de parseBHD de route.ts.
 * Retorna { monto, comercio, estado } o null si no parsea, o 'SKIPPED' si se ignora.
 */
function parseBHD(bodyText) {
  const text = bodyText
  if (!text) return null

  // Ignorar rechazadas / reversadas
  if (/Rechazada|Reversada/i.test(text)) return 'SKIPPED:rechazada_reversada'

  // Ignorar transacciones en USD sin contraparte en RD
  if (/\bUS\s+\$[\d,]+\.\d{2}/.test(text) && !/\bRD\s+\$[\d,]+\.\d{2}/.test(text)) {
    return 'SKIPPED:moneda_USD'
  }

  // Extraer monto en RD
  const montoMatch =
    text.match(/RD\s+\$([\d,]+\.?\d*)/) ??
    text.match(/RD\s*\$\s*([\d,]+\.?\d*)/)
  if (!montoMatch) return null

  const monto = parseAmount(montoMatch[1])

  // Extraer comercio: entre el monto y "Aprobada"/"Pendiente"
  const rowMatch = text.match(/\$[\d,]+\.?\d*\s+(.+?)\s+(?:Aprobada|Pendiente)/i)
  const comercio = rowMatch ? rowMatch[1].trim().slice(0, 60) : 'BHD Transacción'

  // Extraer fecha del email (formato: dd/mm/yyyy hh:mm am/pm)
  const fechaMatch = text.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}\s*[ap]m)/i)
  const fechaTx = fechaMatch ? fechaMatch[1].trim() : null

  // Extraer estado (Aprobada / Pendiente)
  const estadoMatch = text.match(/\b(Aprobada|Pendiente)\b/i)
  const estado = estadoMatch ? estadoMatch[1] : 'Desconocido'

  return { monto, comercio, fechaTx, estado }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const QUERY = 'from:Alertas@bhd.com.do subject:"Notificación de Transacciones" newer_than:30d'

console.log('Buscando emails BHD...')
console.log('Query:', QUERY)
console.log('─'.repeat(60))

let msgs = []
try {
  const list = await gmail.users.messages.list({
    userId:     'me',
    q:          QUERY,
    maxResults: 50,
  })
  msgs = list.data.messages ?? []
} catch (err) {
  console.error('Error al listar mensajes:', err.message)
  process.exit(1)
}

console.log(`Mensajes encontrados: ${msgs.length}`)
console.log()

const results = {
  validas:  [],
  skipped:  [],
  errores:  [],
}

for (const msg of msgs) {
  try {
    const full        = await gmail.users.messages.get({ userId: 'me', id: msg.id })
    const payload     = full.data.payload
    const rawHtml     = extractText(payload)
    const bodyText    = stripHtml(rawHtml)
    const internalMs  = Number(full.data.internalDate ?? 0)
    const fechaEmail  = internalMs ? new Date(internalMs).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }) : 'desconocida'

    const result = parseBHD(bodyText)

    if (typeof result === 'string' && result.startsWith('SKIPPED')) {
      results.skipped.push({ id: msg.id, fechaEmail, razon: result })
    } else if (result === null) {
      // Fallo de parseo — guardar snippet para diagnóstico
      results.errores.push({ id: msg.id, fechaEmail, snippet: bodyText.slice(0, 400) })
    } else {
      results.validas.push({
        id:         msg.id,
        fechaEmail,
        fechaTx:    result.fechaTx ?? fechaEmail,
        monto:      result.monto,
        comercio:   result.comercio,
        estado:     result.estado,
      })
    }
  } catch (err) {
    results.errores.push({ id: msg.id, razon: err.message })
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

console.log('='.repeat(60))
console.log(`TRANSACCIONES VALIDAS (${results.validas.length})`)
console.log('='.repeat(60))

if (results.validas.length === 0) {
  console.log('  (ninguna)')
} else {
  results.validas.forEach((tx, i) => {
    console.log(`\n[${i + 1}] ${tx.fechaTx ?? tx.fechaEmail}`)
    console.log(`    Comercio : ${tx.comercio}`)
    console.log(`    Monto    : RD$${tx.monto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`)
    console.log(`    Estado   : ${tx.estado}`)
    console.log(`    Gmail ID : ${tx.id}`)
  })
}

console.log()
console.log('='.repeat(60))
console.log(`IGNORADAS (${results.skipped.length})`)
console.log('='.repeat(60))
results.skipped.forEach(s => {
  console.log(`  ${s.fechaEmail}  razón: ${s.razon}  id: ${s.id}`)
})

if (results.errores.length) {
  console.log()
  console.log('='.repeat(60))
  console.log(`ERRORES DE PARSEO (${results.errores.length}) — revisar snippets`)
  console.log('='.repeat(60))
  results.errores.forEach(e => {
    console.log(`\n  id: ${e.id}  ${e.razon ?? ''}`)
    if (e.snippet) console.log(`  snippet: ${e.snippet}`)
  })
}

console.log()
console.log('Listo.')
