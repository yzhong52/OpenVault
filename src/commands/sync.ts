import { Command } from 'commander';
import { login } from '../tasks/login';
import { exploreAccounts, type AccountType } from '../tasks/accounts';
import { exploreHoldings } from '../tasks/holdings';
import { fetchTransactions } from '../tasks/transactions';
import { createSession } from '../agent';
import { keychainLoad } from '../keychain';
import { openDb } from '../db';
import { saveSync, saveHoldings, saveTransactions, listAccounts } from '../db/storage';
import { prompt, readInstitutions, launchBrowser } from './utils';
import { printAccountSyncResult } from './accounts';
import { printTransactionSyncResult } from './transactions';

export function makeSyncCommand(): Command {
  return new Command('sync')
    .description('Sync accounts and transactions for all institutions (login once per institution)')
    .option('-i, --institution <name>', 'Only sync this institution (case-insensitive)')
    .option('--days <n>', 'Number of days of transaction history to fetch (default: 30)', '30')
    .option('-v, --verbose', 'Show accessibility snapshots in the terminal')
    .option('--demo', 'Hide sensitive data by randomizing balances and account numbers')
    .action(async (opts: { institution?: string; days: string; verbose: boolean; demo: boolean }) => {
      if (opts.verbose) process.env.VERBOSE = '1';
      const lookbackDays = Math.max(1, parseInt(opts.days, 10) || 30);

      let institutions = await readInstitutions();
      if (opts.institution) {
        const filter = opts.institution.toLowerCase();
        institutions = institutions.filter(i => i.name.toLowerCase() === filter);
        if (institutions.length === 0) {
          console.log(`No institution named "${opts.institution}". Run: npm run cli -- institution add`);
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
            console.warn(`No password found in Keychain for ${inst.name} (${inst.username}), skipping.`);
            continue;
          }

          console.log(`\n🤖 Syncing ${inst.name}...`);
          const sessionDir = await createSession(inst.url);
          await login(page, inst.url, { username: inst.username, password }, inst.name, sessionDir);

          // --- Accounts ---
          console.log(`\n  📋 Accounts`);
          const existingAccounts = listAccounts(db)
            .filter(a => a.institutionName === inst.name)
            .map(a => {
              const dbIdPart = a.accountId.split('/').slice(1).join('/');
              const accountId = dbIdPart !== a.accountName ? dbIdPart : undefined;
              return {
                name: a.accountName,
                accountId,
                type: (a.accountType ?? undefined) as AccountType | undefined,
                currency: a.accountCurrency ?? undefined,
              };
            });

          const accounts = await exploreAccounts(page, inst.name, sessionDir, existingAccounts);
          const diff = saveSync(db, inst.name, inst.url, accounts);
          const allSyncedAccounts = listAccounts(db).filter(a => a.institutionName === inst.name);
          printAccountSyncResult(inst.name, diff, allSyncedAccounts, { demo: opts.demo });

          const investmentAccounts = accounts.filter(
            a => a.category === 'Brokerage' || a.category === 'Managed Investment',
          );
          for (const account of investmentAccounts) {
            const row = allSyncedAccounts.find(r => r.accountId === (account.accountId ?? account.name));
            if (!row) continue;
            const holdings = await exploreHoldings(page, inst.name, account, sessionDir);
            saveHoldings(db, row.id, holdings);
            console.log(`  Holdings for ${account.name}: ${holdings.length} position(s)`);
          }

          // --- Transactions ---
          console.log(`\n  💳 Transactions (last ${lookbackDays} days)`);
          for (const account of allSyncedAccounts) {
            try {
              const txs = await fetchTransactions(
                page, inst.name,
                { name: account.accountName, accountId: account.accountId },
                lookbackDays, sessionDir,
              );
              const newTxs = saveTransactions(db, inst.name, account.accountId, txs);
              printTransactionSyncResult(account.accountName, newTxs, txs.length);
            } catch (err) {
              console.error(
                `  ❌ Transactions failed for ${account.accountName}: ` +
                `${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
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
