export interface AccountRow {
  institutionName: string;
  accountName: string;
  accountType: string | null;
  accountCurrency: string | null;
  accountId: string;
  latestDate: string | null;
  amountCents: number | null;
}

export interface NetWorthPoint {
  date: string;
  amountCents: number;
}

export interface TransactionRow {
  id: number;
  institutionName: string;
  accountName: string;
  datetime: string;
  description: string;
  amountCents: number;
  currency: string | null;
}

export type DemoMode = boolean;

export function demoModeFromUrl(): boolean {
  return new URLSearchParams(window.location.search).has('demo');
}

function demoParam(demo: boolean): string {
  return demo ? '?demo=1' : '';
}

export async function fetchAccounts(demo: DemoMode): Promise<AccountRow[]> {
  const res = await fetch(`/api/accounts${demoParam(demo)}`);
  if (!res.ok) throw new Error('Failed to fetch accounts');
  return res.json();
}

export async function fetchNetWorth(demo: DemoMode): Promise<NetWorthPoint[]> {
  const res = await fetch(`/api/net-worth${demoParam(demo)}`);
  if (!res.ok) throw new Error('Failed to fetch net worth history');
  return res.json();
}

export async function fetchTransactions(demo: DemoMode): Promise<TransactionRow[]> {
  const res = await fetch(`/api/transactions${demoParam(demo)}`);
  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}
