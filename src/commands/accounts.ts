import { Command } from 'commander';
import { openDb } from '../db';
import { listAccounts, mergeAccounts } from '../db/storage';
import { printAccountsTable, formatCents, prompt } from './utils';

export function makeAccountsCommand(): Command {
  const cmd = new Command('accounts').description('View stored account data');

  cmd
    .command('list')
    .description('List all accounts and their latest balances')
    .option('--demo', 'Hide sensitive data by randomizing balances and account numbers')
    .action((opts: { demo: boolean }) => {
      const { db, close } = openDb();
      try {
        const rows = listAccounts(db);
        if (rows.length === 0) {
          console.log('No accounts found. Run: npm run cli -- sync');
          return;
        }

        // TODO: store accounts.id without the institution prefix and add a composite
        // unique key on (institution_id, account_id) instead. Once done, remove this split.
        const entries = rows.map(row => {
          const dbIdPart = row.accountId.split('/').slice(1).join('/');
          return {
            institution: row.institutionName,
            account:     row.accountName,
            accountId:   dbIdPart !== row.accountName ? dbIdPart : undefined,
            type:        row.accountType ?? '—',
            currency:    row.accountCurrency ?? undefined,
            balance:     row.amountCents != null ? formatCents(row.amountCents) : '—',
          };
        });
        printAccountsTable(entries, { demo: opts.demo, showInstitution: true });
      } finally {
        close();
      }
    });

  cmd
    .command('merge')
    .description('Merge one account into another, combining their balance history')
    .action(async () => {
      const { db, close } = openDb();
      try {
        const rows = listAccounts(db);
        if (rows.length < 2) {
          console.log('Need at least two accounts to merge.');
          return;
        }

        const entries = rows.map(row => {
          const dbIdPart = row.accountId.split('/').slice(1).join('/');
          return {
            institution: row.institutionName,
            account:     row.accountName,
            accountId:   dbIdPart !== row.accountName ? dbIdPart : undefined,
            type:        row.accountType ?? '—',
            currency:    row.accountCurrency ?? undefined,
            balance:     row.amountCents != null ? formatCents(row.amountCents) : '—',
          };
        });

        // Print numbered list
        console.log();
        const numWidth = String(entries.length).length;
        entries.forEach((e, i) => {
          const num = String(i + 1).padStart(numWidth);
          const bal = e.currency && e.balance !== '—' ? `${e.currency} ${e.balance}` : e.balance;
          console.log(`  ${num}.  ${e.institution}  /  ${e.account}  —  ${e.type}  ${bal}`);
        });
        console.log();

        const parseChoice = (answer: string): number | null => {
          const n = parseInt(answer.trim(), 10);
          return n >= 1 && n <= rows.length ? n - 1 : null;
        };

        let srcIdx: number | null = null;
        while (srcIdx === null) {
          const ans = await prompt('  Source account to merge FROM (will be deleted) [#]: ');
          srcIdx = parseChoice(ans);
          if (srcIdx === null) console.log(`  Please enter a number between 1 and ${rows.length}.`);
        }

        let tgtIdx: number | null = null;
        while (tgtIdx === null) {
          const ans = await prompt('  Target account to merge INTO [#]: ');
          tgtIdx = parseChoice(ans);
          if (tgtIdx === null) console.log(`  Please enter a number between 1 and ${rows.length}.`);
          else if (tgtIdx === srcIdx) { console.log('  Source and target must be different.'); tgtIdx = null; }
        }

        const src = rows[srcIdx];
        const tgt = rows[tgtIdx];
        console.log();
        console.log(`  Merge "${src.accountName}" (${src.institutionName})`);
        console.log(`    into "${tgt.accountName}" (${tgt.institutionName})?`);
        console.log(`  The source account will be permanently deleted.`);
        console.log();
        const confirm = await prompt('  Confirm (y/N): ');
        if (confirm.trim().toLowerCase() !== 'y') {
          console.log('  Aborted.');
          return;
        }

        mergeAccounts(db, src.accountId, tgt.accountId);
        console.log(`  Done. "${src.accountName}" merged into "${tgt.accountName}".`);
      } finally {
        close();
      }
    });

  return cmd;
}
