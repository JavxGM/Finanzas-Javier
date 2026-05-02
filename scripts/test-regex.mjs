// Test BHD parser regex — exactly matching the code in route.ts
// Run: node scripts/test-regex.mjs

const samples = [
  '01/05/2026 05:35 pm RD $1,850.00 Smart Fit Rep Dom Aprobada Reserva de Fondos (Hold)',
  '30/04/2026 03:21 pm RD $500.00 CLARO DOMINICANA Aprobada Compra',
  '01/05/2026 01:49 am RD $120.00 FARMAVIDA Aprobada Compra',
  '01/05/2026 01:49 am RD $120.00 FARMAVIDA Rechazada Compra',
]

function parseAmount(s) {
  return parseFloat(s.replace(/,/g, ''))
}

// Exact regexes from route.ts parseBHD
for (const text of samples) {
  console.log('\nInput:', text)

  // Monto
  const montoMatch = text.match(/RD\s+\$([\d,]+\.?\d*)/)
    ?? text.match(/RD\s*\$\s*([\d,]+\.?\d*)/)
  if (!montoMatch) {
    console.log('  monto: NO MATCH — FAIL')
    continue
  }
  const monto = parseAmount(montoMatch[1])
  console.log('  monto:', monto)

  // Comercio — exact regex from code
  const rowMatch = text.match(/\$[\d,]+\.?\d*\s+(.+?)\s+(?:Aprobada|Rechazada|Pendiente)/i)
  const comercio = rowMatch ? rowMatch[1].trim().slice(0, 60) : 'BHD Transacción'
  console.log('  comercio:', comercio)
  console.log('  -> PARSED OK')
}
