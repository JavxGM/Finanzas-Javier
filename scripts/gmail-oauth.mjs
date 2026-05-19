import http from 'http'
import { exec } from 'child_process'
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
  // .env.local opcional — puede no existir si las vars ya están en el entorno
}

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI  = 'http://localhost:3000/oauth'
const SCOPE         = 'https://www.googleapis.com/auth/gmail.modify'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET deben estar en .env.local')
  process.exit(1)
}

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

const authUrl = auth.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPE,
  prompt: 'consent',
})

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000')
  if (url.pathname !== '/oauth') { res.end(); return }

  const code = url.searchParams.get('code')
  if (!code) { res.end('No code received'); server.close(); return }

  res.end('<h2>✅ Autorizado. Puedes cerrar esta pestaña.</h2>')
  server.close()

  try {
    const { tokens } = await auth.getToken(code)
    if (tokens.refresh_token) {
      console.log('\n✅ REFRESH TOKEN obtenido:\n')
      console.log(tokens.refresh_token)
      console.log('\nPégalo de vuelta en el chat.\n')
    } else {
      console.error('\n❌ No refresh_token en respuesta:', JSON.stringify(tokens, null, 2))
    }
  } catch (e) {
    console.error('\n❌ Error:', e.message)
  }
})

server.listen(3000, () => {
  console.log('Abriendo Google OAuth en el browser...')
  exec(process.platform === 'win32' ? `start "" "${authUrl}"` : `open "${authUrl}"`)
})
