import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import type { Account } from './tasks/accounts';

const DB_PATH = path.join(os.homedir(), '.openvault', 'data.db');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS institutions (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id             TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES institutions(id),
    name           TEXT NOT NULL,
    type           TEXT
  );

  CREATE TABLE IF NOT EXISTS syncs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    institution_id TEXT    NOT NULL REFERENCES institutions(id),
    synced_at      TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS balances (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id   TEXT    NOT NULL REFERENCES accounts(id),
    sync_id      INTEGER NOT NULL REFERENCES syncs(id),
    amount_cents INTEGER
  );
`;

export function openDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

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
  db: Database.Database,
  institutionName: string,
  institutionUrl: string,
  accounts: Account[],
): void {
  const institutionId = slugify(institutionName);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO institutions (id, name, url) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url
    `).run(institutionId, institutionName, institutionUrl);

    const { lastInsertRowid: syncId } = db.prepare(`
      INSERT INTO syncs (institution_id, synced_at) VALUES (?, ?)
    `).run(institutionId, new Date().toISOString());

    for (const account of accounts) {
      const accountId = `${institutionId}/${account.name}/${account.type ?? ''}`;

      db.prepare(`
        INSERT INTO accounts (id, institution_id, name, type) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(accountId, institutionId, account.name, account.type ?? null);

      db.prepare(`
        INSERT INTO balances (account_id, sync_id, amount_cents) VALUES (?, ?, ?)
      `).run(accountId, syncId, account.balance ? parseCents(account.balance) : null);
    }
  })();
}
