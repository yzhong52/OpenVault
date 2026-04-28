import { Command } from 'commander';
import { openDb } from '../db';
import { listAccounts } from '../db/storage';

export function makeAccountsCommand(): Command {
  const cmd = new Command('accounts').description('View stored account data');

  cmd
    .command('list')
    .description('List all accounts and their latest balances')
    .action(() => {
      const { db, close } = openDb();
      try {
        const rows = listAccounts(db);
        if (rows.length === 0) {
          console.log('No accounts found. Run: npm run cli -- sync');
          return;
        }

        const formatted = rows.map(row => ({
          institution: row.institutionName,
          account:     row.accountName,
          type:        row.accountType ?? '—',
          balance:     row.amountCents != null
            ? `$${(row.amountCents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`
            : '—',
        }));

        const headers = { institution: 'Institution', account: 'Account', type: 'Type', balance: 'Balance' };
        const col = (key: keyof typeof headers) =>
          Math.max(headers[key].length, ...formatted.map(r => r[key].length));
        const w = { institution: col('institution'), account: col('account'), type: col('type'), balance: col('balance') };

        const row = (i: string, a: string, t: string, b: string) =>
          `  ${i.padEnd(w.institution)}  ${a.padEnd(w.account)}  ${t.padEnd(w.type)}  ${b.padStart(w.balance)}`;
        const divider = row('-'.repeat(w.institution), '-'.repeat(w.account), '-'.repeat(w.type), '-'.repeat(w.balance));

        console.log();
        console.log(row(headers.institution, headers.account, headers.type, headers.balance));
        console.log(divider);
        for (const r of formatted) {
          console.log(row(r.institution, r.account, r.type, r.balance));
        }
        console.log();
      } finally {
        close();
      }
    });

  return cmd;
}
