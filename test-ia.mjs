import { chromium } from 'playwright';

const BASE = 'https://finanzas-javier.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];

  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  console.log('--- Abriendo app ---');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  console.log('✓ App cargada');

  // Verificar tabs principales
  const tabs = await page.$$eval('.tab', els => els.map(e => e.textContent.trim()));
  console.log('Tabs:', tabs.join(', '));
  const hasIA = tabs.includes('IA');
  console.log(hasIA ? '✓ Tab IA presente' : '✗ Tab IA NO encontrado');

  // Click en tab IA
  await page.getByRole('button', { name: 'IA' }).click();
  await page.waitForTimeout(500);
  const iaVisible = await page.isVisible('#page-ia');
  console.log(iaVisible ? '✓ Página IA visible' : '✗ Página IA no visible');

  // Verificar elementos del tab IA
  const btnAnalizar = await page.isVisible('#ia-analizar-btn');
  const chatInput = await page.isVisible('#ia-input');
  console.log(btnAnalizar ? '✓ Botón Analizar presente' : '✗ Botón Analizar ausente');
  console.log(chatInput ? '✓ Input chat presente' : '✗ Input chat ausente');

  // Click Analizar mes y esperar respuesta (max 30s)
  console.log('--- Probando Analizar mes ---');
  await page.click('#ia-analizar-btn');
  try {
    await page.waitForSelector('#ia-resultado', { state: 'visible', timeout: 30000 });
    const text = await page.$eval('#ia-resultado-body', el => el.textContent.trim());
    console.log('✓ Respuesta IA recibida (' + text.length + ' chars)');
    console.log('Preview:', text.slice(0, 200) + (text.length > 200 ? '...' : ''));
  } catch (e) {
    // Puede que haya error visible
    const errText = await page.$eval('#ia-error', el => el.textContent).catch(() => '');
    console.log('✗ Sin respuesta. Error:', errText || e.message);
  }

  // Verificar tab Deudas
  console.log('--- Verificando Deudas ---');
  await page.getByRole('button', { name: 'Deudas' }).click();
  await page.waitForTimeout(300);
  const samLiquidado = await page.getByText('Liquidado ✓').isVisible();
  const cuota1Pagada = await page.getByText('Cuota 1 · PAGADA ✓').isVisible();
  const cuota3Proxima = await page.getByText('Cuota 3 · PROXIMA').isVisible();
  console.log(samLiquidado ? '✓ SAM Liquidado ✓' : '✗ SAM no muestra Liquidado');
  console.log(cuota1Pagada ? '✓ Cuota 1 PAGADA ✓' : '✗ Cuota 1 no marcada pagada');
  console.log(cuota3Proxima ? '✓ Cuota 3 PROXIMA ✓' : '✗ Cuota 3 no es PROXIMA');

  // Verificar Pagos Julio
  console.log('--- Verificando Pagos Julio ---');
  await page.getByRole('button', { name: 'Pagos' }).click();
  await page.waitForTimeout(300);

  if (errors.length) {
    console.log('\n⚠ Errores JS:', errors.join('\n'));
  } else {
    console.log('\n✓ Sin errores JS en consola');
  }

  await browser.close();
  console.log('\n--- Test completado ---');
})();
