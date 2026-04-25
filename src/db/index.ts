import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { Transaction } from '../connectors/index';

function dbPath(): string {
  const dir = path.join(os.homedir(), '.openvault');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'data.db');
}

export function openDb(): Database.Database {
  const db = new Database(dbPath());
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id               TEXT PRIMARY KEY,
      institution_id   TEXT NOT NULL,
      account_id       TEXT NOT NULL,
      date             TEXT NOT NULL,
      amount           REAL NOT NULL,
      currency         TEXT NOT NULL,
      description      TEXT NOT NULL,
      raw_description  TEXT,
      category         TEXT,
      synced_at        TEXT NOT NULL
    )
  `);
  return db;
}

export function upsertTransactions(db: Database.Database, txns: Transaction[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO transactions
      (id, institution_id, account_id, date, amount, currency,
       description, raw_description, category, synced_at)
    VALUES
      (@id, @institutionId, @accountId, @date, @amount, @currency,
       @description, @rawDescription, @category, @syncedAt)
  `);
  db.transaction((rows: Transaction[]) => {
    for (const row of rows) stmt.run(row);
  })(txns);
}
