import { chromium } from 'playwright';

const BASE = 'https://finanzas-javier.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];

  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  console.log('Abriendo app...');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {
    return page.evaluate(() => { var el = document.getElementById('loading'); if(el) el.style.display='none'; });
  });
  await page.waitForTimeout(300);
  console.log('✓ App cargada y lista');

  // --- Tabs presentes ---
  const tabTexts = await page.$$eval('.tab', tabs => tabs.map(t => t.textContent.trim()));
  const esperados = ['Inicio','Pagos','Registro','Analytics','Deudas','IA','Lista'];
  const faltantes = esperados.filter(t => !tabTexts.includes(t));
  console.log(faltantes.length === 0 ? '✓ Todos los tabs presentes: ' + esperados.join(' · ') : '✗ Tabs faltantes: ' + faltantes.join(', '));

  // --- Tab Registro: formulario gasto visible ---
  await page.getByRole('button', { name: 'Registro' }).click();
  await page.waitForTimeout(400);
  const formGasto = await page.isVisible('#reg-form-gasto');
  console.log(formGasto ? '✓ Registro: formulario gasto visible' : '✗ Registro: formulario gasto no visible');

  // --- Toggle a Entrada ---
  await page.getByRole('button', { name: 'Entrada' }).first().click();
  await page.waitForTimeout(200);
  const formEntrada = await page.isVisible('#reg-form-entrada');
  console.log(formEntrada ? '✓ Registro: toggle entrada funciona' : '✗ Registro: toggle entrada no funciona');

  // --- Analytics: chips de mes ---
  await page.getByRole('button', { name: 'Analytics' }).click();
  await page.waitForTimeout(800);
  const chipsEl = await page.$('#an-mes-chips');
  const chipsHTML = chipsEl ? await chipsEl.innerHTML() : '';
  const numChips = (chipsHTML.match(/mes-chip/g) || []).length;
  console.log(numChips > 0 ? `✓ Analytics: ${numChips} chips de mes` : '✗ Analytics: sin chips de mes');

  const catRows = await page.$$('.an-bar-row');
  console.log(catRows.length > 0 ? `✓ Analytics: ${catRows.length} categorías` : '✗ Analytics: sin categorías');

  // --- Deudas: SAM + Ademi + Score integrado ---
  await page.getByRole('button', { name: 'Deudas' }).click();
  await page.waitForTimeout(300);
  const sam    = await page.getByText('Liquidado ✓').isVisible();
  const cuota1 = await page.getByText('Cuota 1 · PAGADA ✓').isVisible();
  const score  = await page.getByText('Score crediticio · Credicefi').isVisible();
  console.log(sam   ? '✓ Deudas: SAM Liquidado' : '✗ Deudas: SAM no liquidado');
  console.log(cuota1? '✓ Deudas: Cuota 1 PAGADA' : '✗ Deudas: Cuota 1 sin marcar');
  console.log(score ? '✓ Deudas: Score integrado visible' : '✗ Deudas: Score no visible');

  // --- Tab Lista (wishlist) ---
  await page.getByRole('button', { name: 'Lista' }).click();
  await page.waitForTimeout(300);
  const listaVisible = await page.isVisible('#page-lista');
  const listaForm    = await page.isVisible('#w-nombre');
  console.log(listaVisible ? '✓ Lista: página visible' : '✗ Lista: página no visible');
  console.log(listaForm    ? '✓ Lista: formulario presente' : '✗ Lista: formulario no presente');

  // --- IA ---
  await page.getByRole('button', { name: 'IA' }).click();
  await page.waitForTimeout(300);
  const iaVisible = await page.isVisible('#page-ia');
  console.log(iaVisible ? '✓ Tab IA visible' : '✗ Tab IA no visible');

  if (errors.length) {
    console.log('\n⚠ Errores JS:\n' + errors.join('\n'));
  } else {
    console.log('\n✓ Sin errores JS en consola');
  }

  await browser.close();
  console.log('--- Test completado ---');
})();
