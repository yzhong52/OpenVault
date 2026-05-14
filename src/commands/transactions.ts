import { Command } from 'commander';
import { openDb } from '../db';
import { listTransactions, type TransactionRow } from '../db/storage';
import type { Transaction } from '../tasks/transactions';
import { formatCents } from './utils';

export function printTransactionSyncResult(
  accountName: string,
  newTxs: Transaction[],
  totalFetched: number,
): void {
  const alreadyStored = totalFetched - newTxs.length;
  const skippedNote = alreadyStored > 0 ? ` (${alreadyStored} already stored)` : '';
  if (newTxs.length === 0) {
    console.log(`  (no new transactions for ${accountName}${skippedNote})`);
  } else {
    console.log(`  ✓ ${newTxs.length} new transaction(s) for ${accountName}${skippedNote}:`);
    printNewTransactionsTable(newTxs);
  }
}

function printNewTransactionsTable(txs: Transaction[]): void {
  const entries = txs.map(t => ({
    date:        t.datetime.includes('T') ? t.datetime.slice(0, 16).replace('T', ' ') : t.datetime,
    description: t.description,
    amount:      t.currency
      ? `${t.currency} ${formatCents(Math.round(t.amount * 100))}`
      : formatCents(Math.round(t.amount * 100)),
  }));

  const w = {
    date:        Math.max('Date'.length,        ...entries.map(e => e.date.length)),
    description: Math.max('Description'.length,  ...entries.map(e => e.description.length)),
    amount:      Math.max('Amount'.length,       ...entries.map(e => e.amount.length)),
  };
  const fmt = (e: typeof entries[number]) => [
    e.date.padEnd(w.date),
    e.description.padEnd(w.description),
    e.amount.padStart(w.amount),
  ].join('  ');

  console.log(`    ${fmt({ date: 'Date', description: 'Description', amount: 'Amount' })}`);
  console.log(`    ${fmt({ date: '-'.repeat(w.date), description: '-'.repeat(w.description), amount: '-'.repeat(w.amount) })}`);
  for (const e of entries) console.log(`    ${fmt(e)}`);
  console.log();
}

function printTransactionsTable(rows: TransactionRow[], { demo }: { demo: boolean }): void {
  if (rows.length === 0) {
    console.log('No transactions found. Run: npm run cli -- sync');
    return;
  }

  const entries = rows.map(r => ({
    date:        r.datetime.includes('T') ? r.datetime.slice(0, 16).replace('T', ' ') : r.datetime,
    institution: r.institutionName,
    account:     r.accountName,
    description: r.description,
    amount:      r.currency
      ? `${r.currency} ${formatCents(r.amountCents)}`
      : formatCents(r.amountCents),
  }));

  if (demo) {
    for (const e of entries) {
      e.amount = formatCents(Math.round((Math.random() * 2000 - 1000) * 100));
      e.description = '*** redacted ***';
    }
  }

  const w = {
    date:        Math.max('Date'.length,        ...entries.map(e => e.date.length)),
    institution: Math.max('Institution'.length,  ...entries.map(e => e.institution.length)),
    account:     Math.max('Account'.length,      ...entries.map(e => e.account.length)),
    description: Math.max('Description'.length,  ...entries.map(e => e.description.length)),
    amount:      Math.max('Amount'.length,       ...entries.map(e => e.amount.length)),
  };

  const fmt = (e: typeof entries[number]) => [
    e.date.padEnd(w.date),
    e.institution.padEnd(w.institution),
    e.account.padEnd(w.account),
    e.description.padEnd(w.description),
    e.amount.padStart(w.amount),
  ].join('  ');

  const header = fmt({
    date: 'Date', institution: 'Institution', account: 'Account',
    description: 'Description', amount: 'Amount',
  });
  const divider = fmt({
    date: '-'.repeat(w.date), institution: '-'.repeat(w.institution),
    account: '-'.repeat(w.account), description: '-'.repeat(w.description),
    amount: '-'.repeat(w.amount),
  });

  console.log();
  console.log(`  ${header}`);
  console.log(`  ${divider}`);
  for (const e of entries) {
    console.log(`  ${fmt(e)}`);
  }
  console.log();
}

export function makeTransactionsCommand(): Command {
  const cmd = new Command('transactions').description('Sync and view transaction data');

  cmd
    .command('list')
    .description('List recent transactions')
    .option('-i, --institution <name>', 'Filter by institution name')
    .option('-a, --account <name>', 'Filter by account name')
    .option('--days <n>', 'Number of past days to show (default: 30)', '30')
    .option('--demo', 'Hide sensitive data')
    .action((opts: { institution?: string; account?: string; days: string; demo: boolean }) => {
      const days = Math.max(1, parseInt(opts.days, 10) || 30);
      const { db, close } = openDb();
      try {
        const rows = listTransactions(db, {
          institutionName: opts.institution,
          accountName:     opts.account,
          days,
        });
        printTransactionsTable(rows, { demo: opts.demo ?? false });
      } finally {
        close();
      }
    });

  return cmd;
}
