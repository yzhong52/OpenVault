const demoBalances = new Map<string, number>();

function isDemoDebt(accountId: string, type: string | null): boolean {
  if (type === 'credit' || type === 'loan') return true;
  // Deterministically make ~1 in 4 accounts a debt account.
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = (hash * 31 + accountId.charCodeAt(i)) & 0x7fffffff;
  }
  return hash % 4 === 0;
}

export function getDemoBalance(accountId: string, type: string | null): number {
  if (demoBalances.has(accountId)) return demoBalances.get(accountId)!;
  let cents: number;
  if (isDemoDebt(accountId, type)) {
    cents = -Math.floor((Math.random() * (22_000 - 3_000) + 3_000) * 100);
  } else {
    const [min, max] = type === 'investment' ? [80_000, 600_000] : [15_000, 120_000];
    cents = Math.floor((Math.random() * (max - min) + min) * 100);
  }
  demoBalances.set(accountId, cents);
  return cents;
}

export function applyDemoMask(name: string): string {
  // E.g. "Chequing 1234" -> "Chequing ••••"
  const masked = name.replace(/\d+/g, '••••');
  // If there were no digits, just append dots to show it's masked
  return masked === name ? `${name.split(' ')[0]} ••••` : masked;
}
