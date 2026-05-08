import { Command } from 'commander';
import { openDb } from '../db';
import { listAccounts, mergeAccounts, type AccountRow } from '../db/storage';
import { printAccountsTable, formatCents, prompt, selectFromList } from './utils';

function accountLabels(rows: AccountRow[], { showInstitution }: { showInstitution: boolean }): string[] {
  const items = rows.map(row => {
    const bal = row.amountCents != null ? formatCents(row.amountCents) : '—';
    return {
      institution: row.institutionName,
      name:        row.accountName,
      type:        row.accountType ?? '—',
      balance:     row.accountCurrency && bal !== '—' ? `${row.accountCurrency} ${bal}` : bal,
    };
  });
  const w = {
    institution: showInstitution ? Math.max(...items.map(i => i.institution.length)) : 0,
    name:        Math.max(...items.map(i => i.name.length)),
    type:        Math.max(...items.map(i => i.type.length)),
    balance:     Math.max(...items.map(i => i.balance.length)),
  };
  return items.map(i => [
    showInstitution ? i.institution.padEnd(w.institution) : null,
    i.name.padEnd(w.name),
    i.type.padEnd(w.type),
    i.balance.padStart(w.balance),
  ].filter(Boolean).join('  '));
}

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

        const srcIdx = await selectFromList(
          accountLabels(rows, { showInstitution: true }),
          'Source account to merge FROM (will be deleted):',
        );

        const src = rows[srcIdx];
        const tgtRows = rows.filter((r, i) => i !== srcIdx && r.institutionName === src.institutionName);
        if (tgtRows.length === 0) {
          console.log(`  No other accounts found under ${src.institutionName}. Nothing to merge into.`);
          return;
        }
        const tgtIdx = await selectFromList(
          accountLabels(tgtRows, { showInstitution: false }),
          'Target account to merge INTO:',
        );

        const tgt = tgtRows[tgtIdx];
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
