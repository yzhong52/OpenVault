import { Command } from 'commander';
import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { login } from './login';
import { findAccounts } from './accounts';
import { keychainSave, keychainLoad } from './keychain';

interface AccountEntry {
  name: string;
  url: string;
  username: string;
}

const DATA_DIR      = path.join(os.homedir(), '.openvault');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const PROFILE_DIR   = process.env.OPENVAULT_PROFILE_DIR ?? path.join(DATA_DIR, 'browser-profile');

async function readAccounts(): Promise<AccountEntry[]> {
  try {
    return JSON.parse(await fs.readFile(ACCOUNTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

async function writeAccounts(accounts: AccountEntry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2) + '\n');
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function promptPassword(question: string): Promise<string> {
  process.stdout.write(question);
  // Hide input while typing
  process.stdin.setRawMode?.(true);
  return new Promise(resolve => {
    let value = '';
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', function handler(ch) {
      const char = ch.toString();
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(value);
      } else if (char === '') {
        process.exit();
      } else if (char === '') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('openvault')
  .description('Agentic financial data aggregator');

const account = program.command('account').description('Manage saved accounts');

account
  .command('add')
  .description('Add a new account and save credentials to Keychain')
  .action(async () => {
    const name     = await prompt('Institution name (e.g. Wealthsimple): ');
    const url      = await prompt('Login URL: ');
    const username = await prompt('Username or email: ');
    const password = await promptPassword('Password: ');

    const accounts = await readAccounts();
    const existing = accounts.findIndex(a => a.name === name && a.username === username);
    if (existing >= 0) {
      accounts[existing] = { name, url, username };
    } else {
      accounts.push({ name, url, username });
    }

    await writeAccounts(accounts);
    keychainSave(name, username, password);
    console.log(`Saved ${name} (${username})`);
  });

program
  .command('sync')
  .description('Login to all saved accounts and print balances')
  .option('-a, --account <name>', 'Only sync the account with this name (case-insensitive)')
  .action(async (opts: { account?: string }) => {
    let accounts = await readAccounts();
    if (opts.account) {
      const filter = opts.account.toLowerCase();
      accounts = accounts.filter(a => a.name.toLowerCase() === filter);
      if (accounts.length === 0) {
        console.log(`No account named "${opts.account}". Run: npm run cli account list`);
        return;
      }
    }
    if (accounts.length === 0) {
      console.log('No accounts saved. Run: npm run cli account add');
      return;
    }

    await fs.mkdir(PROFILE_DIR, { recursive: true });
    await fs.mkdir('logs', { recursive: true });

    const context = await chromium.launchPersistentContext(
      PROFILE_DIR,
      {
        headless: false,
        channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled'],
      },
    );

    try {
      const page = context.pages()[0] ?? await context.newPage();

      for (const entry of accounts) {
        const password = keychainLoad(entry.name, entry.username);
        if (!password) {
          console.warn(`No password found in Keychain for ${entry.name} (${entry.username}), skipping.`);
          continue;
        }

        console.log(`\nSyncing ${entry.name}...`);
        await login(page, entry.url, { email: entry.username, password });

        const found = await findAccounts(page);
        console.log(`\n${entry.name} accounts:`);
        for (const a of found) {
          const parts = [a.name, a.type, a.balance].filter(Boolean);
          console.log(' ', parts.join(' — '));
        }
      }
    } finally {
      await prompt('\nPress Enter to close... ');
      await context.close();
    }
  });

program.parse();
