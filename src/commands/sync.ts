import { Command } from 'commander';
import { login } from '../tasks/login';
import { exploreAccounts, type AccountType } from '../tasks/accounts';
import { fetchTransactions } from '../tasks/transactions';
import { createSession } from '../agent';
import { keychainLoad } from '../keychain';
import { openDb } from '../db';
import { saveSync, saveTransactions, listAccounts } from '../db/storage';
import { prompt, readInstitutions, printAccountsTable, formatCents, launchBrowser } from './utils';

export function makeSyncCommand(): Command {
  return new Command('sync')
    .description('Login to all saved institutions and sync accounts')
    .option(
      '-i, --institution <name>',
      'Only sync the institution with this name (case-insensitive)',
    )
    .option('-v, --verbose', 'Show accessibility snapshots in the terminal')
    .option('--demo', 'Hide sensitive data by randomizing balances and account numbers')
    .option('--days <n>', 'Number of days of transaction history to fetch (default: 30)', '30')
    .action(async (opts: {
      institution: string | undefined;
      verbose: boolean;
      demo: boolean;
      days: string;
    }) => {
      if (opts.verbose) process.env.VERBOSE = '1';
      const lookbackDays = Math.max(1, parseInt(opts.days, 10) || 30);
      let institutions = await readInstitutions();
      if (opts.institution) {
        const filter = opts.institution.toLowerCase();
        institutions = institutions.filter(i => i.name.toLowerCase() === filter);
        if (institutions.length === 0) {
          console.log(
            `No institution named "${opts.institution}". Run: npm run cli -- institution add`,
          );
          return;
        }
      }
      if (institutions.length === 0) {
        console.log('No institutions saved. Run: npm run cli -- institution add');
        return;
      }

      const { db, close } = openDb();
      const context = await launchBrowser();

      try {
        const page = context.pages()[0] ?? await context.newPage();

        for (const inst of institutions) {
          const password = keychainLoad(inst.name, inst.username);
          if (!password) {
            console.warn(
              `No password found in Keychain for ${inst.name} (${inst.username}), skipping.`,
            );
            continue;
          }

          console.log(`\n🤖 Syncing ${inst.name}...`);
          const sessionDir = await createSession(inst.url);
          await login(page, inst.url, { username: inst.username, password }, inst.name, sessionDir);

          const existingAccountsMsg = listAccounts(db)
            .filter(a => a.institutionName === inst.name)
            .map(a => {
              // Extract the ID part (everything after the first '/') if it differs from name
              const dbIdPart = a.accountId.split('/').slice(1).join('/');
              const accountId = dbIdPart !== a.accountName ? dbIdPart : undefined;
              return {
                name: a.accountName,
                accountId,
                type: (a.accountType ?? undefined) as AccountType | undefined,
                currency: a.accountCurrency ?? undefined,
              };
            });

          const accounts = await exploreAccounts(page, inst.name, sessionDir, existingAccountsMsg);
          saveSync(db, inst.name, inst.url, accounts);

          for (const account of accounts) {
            const rawAccountId = account.accountId ?? account.name;
            try {
              const txs = await fetchTransactions(page, inst.name, account, lookbackDays, sessionDir);
              saveTransactions(db, inst.name, rawAccountId, txs);
              console.log(`  ✓ ${txs.length} transaction(s) saved for ${account.name}`);
            } catch (err) {
              console.error(
                `  ❌ Transactions failed for ${account.name}: ` +
                `${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }

          console.log(`\n${inst.name} accounts:`);
          printAccountsTable(accounts.map(a => ({
            institution: inst.name,
            account:     a.name,
            accountId:   a.accountId,
            type:        a.type ?? '—',
            currency:    a.currency ?? undefined,
            balance:     a.balance != null ? formatCents(Math.round(a.balance * 100)) : '—',
          // institution already shown as header above
          })), { demo: opts.demo, showInstitution: false });
        }
      } catch (err) {
        console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        close();
        await prompt('\nPress Enter to close... ');
        await context.close();
      }
    });
}
