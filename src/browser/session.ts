import { Browser, Page, chromium } from 'playwright';
import * as readline from 'readline';

export class Session {
  readonly page: Page;
  private browser: Browser;

  private constructor(browser: Browser, page: Page) {
    this.browser = browser;
    this.page = page;
  }

  static async launch(): Promise<Session> {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    return new Session(browser, page);
  }

  async close(): Promise<void> {
    await this.browser.close();
  }

  async snapshot(): Promise<string> {
    return this.page.locator('body').ariaSnapshot();
  }

  async waitForUser(message: string): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>(resolve => {
      rl.question(`\n[PAUSE] ${message}\nPress Enter to continue... `, () => {
        rl.close();
        resolve();
      });
    });
  }
}
