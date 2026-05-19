import { chromium } from 'playwright';

const SECRETS = [
  'https://github.com/JavxGM/Finanzas-Javier/security/secret-scanning/unblock-secret/3DxTNr9r9mL6d801haE6cG23kpZ',
  'https://github.com/JavxGM/Finanzas-Javier/security/secret-scanning/unblock-secret/3DxTNn4NNFGhh97IznAChkPvQt2',
  'https://github.com/JavxGM/Finanzas-Javier/security/secret-scanning/unblock-secret/3DxTNsovBv21jPW7oRDrnmqU9p9',
  'https://github.com/JavxGM/Finanzas-Javier/security/secret-scanning/unblock-secret/3DxTNrE6fBodP788rJBkEZ4y4IX',
  'https://github.com/JavxGM/Finanzas-Javier/security/secret-scanning/unblock-secret/3DxTNnyVNZUzrFtdlx30xslpFtp',
];

const browser = await chromium.launch({ headless: false, slowMo: 500 });
const context = await browser.newContext();
const page = await context.newPage();

// Go to GitHub first so user can log in if needed
await page.goto('https://github.com/login');
console.log('If not logged in, please log in to GitHub in the browser window...');

// Wait until logged in (check for avatar or user menu)
await page.waitForSelector('meta[name="user-login"]', { timeout: 120000 });
console.log('Logged in! Processing secrets...');

for (const url of SECRETS) {
  console.log(`\nVisiting: ${url}`);
  await page.goto(url);
  await page.waitForLoadState('networkidle');

  // Look for the "Allow secret" or "It's used in tests" button/radio
  // GitHub's UI may show different options — try to find and click the allow button
  const allowButton = page.locator('button, input[type="submit"]').filter({ hasText: /allow|bypass|it.s used/i }).first();

  if (await allowButton.count() > 0) {
    // If there's a radio for reason, pick "It's used in tests"
    const reasonRadio = page.locator('input[type="radio"]').filter({ hasText: /test/i }).first();
    if (await reasonRadio.count() > 0) {
      await reasonRadio.click();
    } else {
      // Pick first radio option available
      const firstRadio = page.locator('input[type="radio"]').first();
      if (await firstRadio.count() > 0) await firstRadio.click();
    }

    await allowButton.click();
    console.log(`  Clicked allow button`);
    await page.waitForLoadState('networkidle');
    console.log(`  Done: ${url}`);
  } else {
    // Take a screenshot to debug
    await page.screenshot({ path: `scripts/debug-secret-${SECRETS.indexOf(url)}.png` });
    console.log(`  Could not find allow button — screenshot saved. Page title: ${await page.title()}`);
    console.log('  Waiting 10s for manual action...');
    await page.waitForTimeout(10000);
  }
}

console.log('\nAll secrets processed. Closing browser...');
await browser.close();
