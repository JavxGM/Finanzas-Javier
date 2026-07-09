import { chromium } from 'playwright';

const URL = 'https://finanzas-javier.vercel.app/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const results = [];

// 1. Tabs visibles (Uber no debe aparecer)
const tabs = await page.$$eval('.tab', tabs => tabs.map(t => t.textContent.trim()));
results.push({ check: 'Tabs visibles', value: tabs.join(', '), ok: !tabs.some(t => t.includes('Uber')) });

// 2. Ir a Pagos y revisar junio
await page.click('button.tab:has-text("Pagos")');
await page.waitForTimeout(500);

// Navegar a Junio si hay selector de mes
const mesButtons = await page.$$eval('[onclick*="setMes"], .mes-btn, button', bs =>
  bs.filter(b => b.textContent.includes('Jun') || b.textContent.includes('Junio')).map(b => b.textContent.trim())
);
results.push({ check: 'Botones de mes encontrados', value: mesButtons.join(', ') || '(ninguno visible)' });

// Hacer click en Junio si existe
const junBtn = page.locator('button, [onclick]').filter({ hasText: /jun/i }).first();
if (await junBtn.count() > 0) {
  await junBtn.click();
  await page.waitForTimeout(500);
}

// Verificar que NO aparece Gasolina en los pagos del plan
const planText = await page.locator('#page-pagos').textContent();
results.push({ check: 'Gasolina ausente en pagos', ok: !planText.includes('Gasolina'), value: planText.includes('Gasolina') ? 'ENCONTRADO (error)' : 'No aparece (ok)' });
results.push({ check: 'ADEMI presente en Q1',  ok: planText.includes('Ademi'), value: planText.includes('Ademi') ? 'Presente (ok)' : 'AUSENTE (error)' });
results.push({ check: 'Lentes RD$2,000',       ok: planText.includes('2,000'), value: planText.includes('2,000') ? 'Encontrado (ok)' : 'AUSENTE (error)' });
results.push({ check: 'Ingreso quincena 18,000', ok: planText.includes('18,000'), value: planText.includes('18,000') ? 'Encontrado (ok)' : 'No aparece en texto' });

// Screenshot del tab pagos
await page.screenshot({ path: 'scripts/verify-pagos.png', fullPage: false });

// 3. Revisar tab Uber oculto
const uberVisible = await page.locator('#page-uber').isVisible();
results.push({ check: 'Página Uber oculta', ok: !uberVisible, value: uberVisible ? 'VISIBLE (error)' : 'Oculta (ok)' });

await browser.close();

console.log('\n=== VERIFICACIÓN finanzas-javier.vercel.app ===\n');
results.forEach(r => {
  const icon = r.ok === false ? '❌' : r.ok === true ? '✅' : '  ';
  console.log(`${icon} ${r.check}: ${r.value}`);
});
console.log('\nScreenshot guardado en scripts/verify-pagos.png');
