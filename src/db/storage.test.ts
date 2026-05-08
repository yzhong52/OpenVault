import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as path from 'path';
import * as schema from './schema';
import { getNetWorthHistory } from './storage';
import { type Db } from './index';

describe('getNetWorthHistory', () => {
  let sqlite: Database.Database;
  let db: Db;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'src/db/migrations') });

    // Seed basic relations
    db.insert(schema.institutions)
      .values({ id: 'td', name: 'TD', url: 'https://td.com' })
      .run();

    db.insert(schema.accounts)
      .values([
        { institutionId: 'td', accountId: 'chequing', name: 'Chequing', type: 'Checking', currency: 'CAD' },
        { institutionId: 'td', accountId: 'savings',  name: 'Savings',  type: 'Savings',  currency: 'CAD' },
      ])
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('carries forward previous balances for accounts not updated on a given day', () => {
    const [chequing, savings] = db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .orderBy(schema.accounts.accountId)
      .all();

    db.insert(schema.balances)
      .values([
        // Day 1: Both accounts synced
        { accountId: chequing.id, date: '2026-05-01', amountCents: 100000 }, // $1000
        { accountId: savings.id,  date: '2026-05-01', amountCents: 200000 }, // $2000

        // Day 2: Only chequing is synced (balance went down to $500)
        // Savings should carry forward its $2000 balance into Day 2's total
        { accountId: chequing.id, date: '2026-05-02', amountCents: 50000 },

        // Day 4: Both accounts synced again (Day 3 is completely missing from DB)
        { accountId: chequing.id, date: '2026-05-04', amountCents: 60000 },  // $600
        { accountId: savings.id,  date: '2026-05-04', amountCents: 210000 }, // $2100
      ])
      .run();

    const history = getNetWorthHistory(db);

    expect(history).toEqual([
      { date: '2026-05-01', amountCents: 300000 }, // 100000 + 200000
      { date: '2026-05-02', amountCents: 250000 }, // 50000 + 200000 (carried forward)
      { date: '2026-05-03', amountCents: 250000 }, // 50000 + 200000 (both carried forward over a completely skipped day)
      { date: '2026-05-04', amountCents: 270000 }, // 60000 + 210000
    ]);
  });
});
