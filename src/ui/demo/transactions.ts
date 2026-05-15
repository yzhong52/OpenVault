import type { TransactionRow } from '../../db/storage';

const DEMO_MERCHANTS: { desc: string; cents: number }[] = [
  { desc: 'Direct Deposit – Payroll',  cents:  285000 },
  { desc: 'Grocery Store',             cents:   -8432 },
  { desc: 'Restaurant',                cents:   -4521 },
  { desc: 'Netflix',                   cents:   -1999 },
  { desc: 'Gas Station',               cents:   -6234 },
  { desc: 'Amazon.ca',                 cents:   -3499 },
  { desc: 'Coffee Shop',               cents:    -645 },
  { desc: 'Gym Membership',            cents:   -4999 },
  { desc: 'TTC Transit',               cents:    -350 },
  { desc: 'Pharmacy',                  cents:   -2341 },
  { desc: 'Spotify',                   cents:   -1099 },
  { desc: 'Hydro Bill',                cents:  -12300 },
  { desc: 'ATM Withdrawal',            cents:  -20000 },
  { desc: 'Grocery Store',             cents:   -6210 },
  { desc: 'Internet Bill',             cents:   -8500 },
  { desc: 'Tim Hortons',               cents:    -387 },
  { desc: 'Restaurant',                cents:   -7823 },
  { desc: 'Direct Deposit – Payroll',  cents:  285000 },
  { desc: 'Gas Station',               cents:   -5100 },
  { desc: 'Apple Store',               cents:  -14999 },
];

// Irregular day offsets: some days have 2-3 transactions, some are skipped
const DAY_OFFSETS = [0, 0, 1, 3, 3, 3, 5, 7, 8, 8, 10, 12, 12, 15, 17, 17, 19, 21, 21, 24];

let cached: TransactionRow[] | null = null;

export function generateDemoTransactions(): TransactionRow[] {
  if (cached) return cached;
  const now = new Date();
  cached = DEMO_MERCHANTS.map((m, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - DAY_OFFSETS[i]);
    return {
      id: -(i + 1),
      institutionName: i % 3 === 0 ? 'TD Bank' : i % 3 === 1 ? 'Wealthsimple' : 'Tangerine',
      accountName: m.cents > 0 ? 'Chequing ••••' : i % 4 === 0 ? 'Savings ••••' : 'Chequing ••••',
      datetime: date.toISOString().slice(0, 10),
      description: m.desc,
      amountCents: m.cents,
      currency: 'CAD',
    };
  });
  return cached;
}
