import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, slowMo: 300 });
const context = await browser.newContext();
const page = await context.newPage();

console.log('Abriendo Vercel dashboard...');
await page.goto('https://vercel.com/javxgms-projects/finanzas-javier/settings/environment-variables');
await page.waitForLoadState('networkidle');

// Si no está logueado, esperar login manual
if (page.url().includes('login') || page.url().includes('signin')) {
  console.log('Esperando login en Vercel...');
  await page.waitForURL(url => !url.toString().includes('login') && !url.toString().includes('signin'), { timeout: 120000 });
  await page.goto('https://vercel.com/javxgms-projects/finanzas-javier/settings/environment-variables');
  await page.waitForLoadState('networkidle');
}

console.log('En settings de env vars, buscando CRON_SECRET...');

// Buscar el botón de reveal/copy del CRON_SECRET
// Vercel muestra un botón de ojo o copy al lado de cada variable
const rows = page.locator('[data-testid="env-var-row"], tr, [class*="env"]');
await page.waitForTimeout(2000);

// Buscar texto CRON_SECRET en la página
const cronRow = page.locator('text=CRON_SECRET').first();
if (await cronRow.count() === 0) {
  await page.screenshot({ path: 'scripts/debug-vercel.png' });
  console.log('No encontré CRON_SECRET en la página. Screenshot guardado.');
  await browser.close();
  process.exit(1);
}

// Hacer scroll para verlo
await cronRow.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);

// Click en el botón de reveal (ojo) cerca de CRON_SECRET
const rowContainer = cronRow.locator('xpath=ancestor::tr | xpath=ancestor::div[contains(@class,"row")] | xpath=ancestor::li').first();
const revealBtn = page.locator('button[aria-label*="reveal" i], button[title*="reveal" i], button[aria-label*="show" i], button[aria-label*="copy" i]').first();

// Intentar click en cualquier botón cerca de CRON_SECRET
await page.screenshot({ path: 'scripts/debug-vercel-before.png' });
console.log('Screenshot guardado en debug-vercel-before.png, intentando revelar...');

// Buscar botón de copy/reveal cerca del texto CRON_SECRET
const nearButtons = page.locator('text=CRON_SECRET').locator('xpath=following::button[1] | xpath=following::button[2]');
if (await nearButtons.count() > 0) {
  await nearButtons.first().click();
  await page.waitForTimeout(1000);
}

// Leer el valor del clipboard o del input que apareció
const secretValue = await page.evaluate(() => {
  // Buscar input type password o text cerca de CRON_SECRET
  const inputs = document.querySelectorAll('input[type="text"], input[type="password"], input[readonly]');
  for (const inp of inputs) {
    if (inp.value && inp.value.length > 5) return inp.value;
  }
  return null;
});

await page.screenshot({ path: 'scripts/debug-vercel-after.png' });

if (!secretValue) {
  console.log('No pude extraer el secret automáticamente. Revisa scripts/debug-vercel-after.png');
  console.log('Dejando browser abierto 30s para revisión manual...');
  await page.waitForTimeout(30000);
  await browser.close();
  process.exit(1);
}

console.log('Secret obtenido. Llamando al cron...');
await browser.close();

// Llamar el cron con el secret
const resp = await fetch(`https://finanzas-javier.vercel.app/api/cron/emails?secret=${encodeURIComponent(secretValue)}&debug=1`);
const result = await resp.json();
console.log('\n=== Resultado del cron ===');
console.log(JSON.stringify(result, null, 2));
