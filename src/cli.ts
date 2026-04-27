import { Command } from 'commander';
import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { login } from './login';
import { findAccounts } from './accounts';
import { keychainSave, keychainLoad } from './keychain';

interface Institution {
  name: string;
  url: string;
  username: string;
}

const DATA_DIR          = path.join(os.homedir(), '.openvault');
const INSTITUTIONS_FILE = path.join(DATA_DIR, 'accounts.json');
const PROFILE_DIR       = process.env.OPENVAULT_PROFILE_DIR ?? path.join(DATA_DIR, 'browser-profile');

async function readInstitutions(): Promise<Institution[]> {
  try {
    return JSON.parse(await fs.readFile(INSTITUTIONS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

async function writeInstitutions(institutions: Institution[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(INSTITUTIONS_FILE, JSON.stringify(institutions, null, 2) + '\n');
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function promptPassword(question: string): Promise<string> {
  process.stdout.write(question);
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
      } else if (char === '') {
        process.exit();
      } else if (char === '') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    });
  });
}

const program = new Command();

program
  .name('openvault')
  .description('Agentic financial data aggregator');

const institution = program.command('institution').description('Manage saved institutions');

institution
  .command('add')
  .description('Add a new institution and save credentials to Keychain')
  .action(async () => {
    const name     = await prompt('Institution name (e.g. Wealthsimple): ');
    const url      = await prompt('Login URL: ');
    const username = await prompt('Username or email: ');
    const password = await promptPassword('Password: ');

    const institutions = await readInstitutions();
    const existing = institutions.findIndex(i => i.name === name && i.username === username);
    if (existing >= 0) {
      institutions[existing] = { name, url, username };
    } else {
      institutions.push({ name, url, username });
    }

    await writeInstitutions(institutions);
    keychainSave(name, username, password);
    console.log(`Saved ${name} (${username})`);
  });

program
  .command('sync')
  .description('Login to all saved institutions and print accounts')
  .option('-i, --institution <name>', 'Only sync the institution with this name (case-insensitive)')
  .action(async (opts: { institution?: string }) => {
    let institutions = await readInstitutions();
    if (opts.institution) {
      const filter = opts.institution.toLowerCase();
      institutions = institutions.filter(i => i.name.toLowerCase() === filter);
      if (institutions.length === 0) {
        console.log(`No institution named "${opts.institution}". Run: npm run cli institution add`);
        return;
      }
    }
    if (institutions.length === 0) {
      console.log('No institutions saved. Run: npm run cli institution add');
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

      for (const inst of institutions) {
        const password = keychainLoad(inst.name, inst.username);
        if (!password) {
          console.warn(`No password found in Keychain for ${inst.name} (${inst.username}), skipping.`);
          continue;
        }

        console.log(`\nSyncing ${inst.name}...`);
        await login(page, inst.url, { email: inst.username, password });

        const accounts = await findAccounts(page);
        console.log(`\n${inst.name} accounts:`);
        for (const account of accounts) {
          const parts = [account.name, account.type, account.balance].filter(Boolean);
          console.log(' ', parts.join(' — '));
        }
      }
    } finally {
      await prompt('\nPress Enter to close... ');
      await context.close();
    }
  });

program.parse();
