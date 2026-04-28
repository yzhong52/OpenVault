import type { Account } from './tasks/accounts';
import { type Db } from './db';
import { institutions, accounts as accountsTable, syncs, balances } from './db/schema';

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function parseCents(raw: string): number | null {
  // Handles "$12,345.67", "-$500", "($1,200.00)"
  const cleaned = raw.replace(/[$,\s]/g, '').replace(/^\((.+)\)$/, '-$1');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n * 100);
}

export function saveSync(
  db: Db,
  institutionName: string,
  institutionUrl: string,
  accountList: Account[],
): void {
  const institutionId = slugify(institutionName);

  db.transaction((tx) => {
    tx.insert(institutions)
      .values({ id: institutionId, name: institutionName, url: institutionUrl })
      .onConflictDoUpdate({
        target: institutions.id,
        set: { name: institutionName, url: institutionUrl },
      })
      .run();

    const sync = tx.insert(syncs)
      .values({ institutionId, syncedAt: new Date().toISOString() })
      .returning({ id: syncs.id })
      .get()!;

    for (const account of accountList) {
      const accountId = `${institutionId}/${account.name}/${account.type ?? ''}`;

      tx.insert(accountsTable)
        .values({ id: accountId, institutionId, name: account.name, type: account.type })
        .onConflictDoNothing()
        .run();

      tx.insert(balances)
        .values({
          accountId,
          syncId: sync.id,
          amountCents: account.balance ? parseCents(account.balance) : null,
        })
        .run();
    }
  });
}
