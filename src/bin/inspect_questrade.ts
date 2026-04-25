import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as readline from 'readline';

const LOGIN_URL = 'https://login.questrade.com/account/login';

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
    await fs.writeFile(`logs/qt_${label}.txt`, tree);
    console.log(`saved logs/qt_${label}.txt`);
  };

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await snap('login');

  // Detect logged-in state by absence of the login button
  const alreadyLoggedIn = !(await page.locator('#btnLogin').isVisible({ timeout: 2000 }).catch(() => false));

  if (alreadyLoggedIn) {
    console.log('already logged in — skipping login flow');
  } else {
    console.log('login form detected — signing in...');

    // Dismiss cookie banner if present
    const cookieBtn = page.locator('#onetrust-accept-btn-handler');
    if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cookieBtn.click();
    }

    const username = process.env.OPENVAULT_QT_USERNAME ?? await prompt('Username: ');
    const password = process.env.OPENVAULT_QT_PASSWORD ?? await prompt('Password: ');

    await page.locator('#userId').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('#btnLogin').click();

    await page.waitForLoadState('domcontentloaded');
    await snap('mfa');

    // MFA method selection screen
    const needsMfaSelection = await page.locator('#sms').isVisible({ timeout: 3000 }).catch(() => false);
    if (needsMfaSelection) {
      await page.locator('#sms').click();
      await page.locator('[data-qt="sendCodeBtn"]').click();

      await page.waitForLoadState('domcontentloaded');
      await snap('otp');

      const otp = await prompt('Enter verification code: ');
      // pressSequentially fires real key events — required to enable the verify button
      await page.locator('#Code').pressSequentially(otp.trim());
      await page.locator('#btn-verify').click();
    }
  }

  await page.waitForLoadState('networkidle');
  await snap('post_login');

  await prompt('Press Enter to close... ');
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
