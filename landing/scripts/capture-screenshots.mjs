import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '../public/screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

const BASE = 'http://localhost:5000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Listen for console messages
  page.on('console', msg => console.log(`[browser] ${msg.type()}: ${msg.text()}`));

  // Step 1: Login via the API using fetch inside the page context
  console.log('Logging in via API…');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);

  const loginResult = await page.evaluate(async () => {
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'marketing_manager', password: 'Manager123!' }),
        credentials: 'include',
      });
      const data = await res.json();
      return { ok: res.ok, message: data.message || data.error || 'ok' };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });
  console.log(`  Login: ${loginResult.ok ? 'OK' : 'FAIL'} — ${loginResult.message}`);

  if (!loginResult.ok) {
    console.log('  Trying ops_manager user…');
    const login2 = await page.evaluate(async () => {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ops_manager', password: 'Manager123!' }),
        credentials: 'include',
      });
      const data = await res.json();
      return { ok: res.ok, message: data.message || data.error || 'ok' };
    });
    console.log(`  Login2: ${login2.ok ? 'OK' : 'FAIL'} — ${login2.message}`);
  }

  // Step 2: Navigate to each page and take screenshots
  console.log('\nCapturing screenshots…');

  const pages = [
    { url: '/kanban', file: 'kanban' },
    { url: '/dashboard', file: 'dashboard' },
    { url: '/calendar', file: 'calendar' },
    { url: '/', file: 'tasks' },
  ];

  for (const { url, file } of pages) {
    console.log(`  ${url} → ${file}.png`);
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2500); // let animations settle
      const filepath = path.join(screenshotsDir, `${file}.png`);
      await page.screenshot({ path: filepath, fullPage: true });
      const stats = fs.statSync(filepath);
      console.log(`    ✓ ${(stats.size / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.log(`    ✗ ${err.message}`);
    }
  }

  await browser.close();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
