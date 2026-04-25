import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as readline from 'readline';

const TD_URL = 'https://easyweb.td.com';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await fs.mkdir('logs', { recursive: true });

  const snap = async (label: string) => {
    const tree = await page.locator('body').ariaSnapshot();
    await fs.writeFile(`logs/td_${label}.txt`, tree);
    console.log(`saved logs/td_${label}.txt`);
  };

  await page.goto(TD_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await snap('landing');

  const username = process.env.OPENVAULT_TD_USERNAME ?? await prompt('Username: ');
  const password = process.env.OPENVAULT_TD_PASSWORD ?? await prompt('Password: ');

  await page.getByRole('textbox', { name: /Username|Access Card/i }).fill(username);
  await page.getByRole('textbox', { name: /Password/i }).fill(password);
  await page.getByRole('button', { name: /Login/i }).click();

  await page.waitForLoadState('domcontentloaded');
  await snap('mfa');

  await prompt('Complete MFA in the browser, then press Enter... ');

  await page.waitForLoadState('networkidle');
  await snap('post_login');

  await prompt('Press Enter to close... ');
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
