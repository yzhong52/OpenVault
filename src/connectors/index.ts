import type { Session } from '../browser/session';

export interface Credentials {
  username: string;
  password: string;
}

export interface Transaction {
  id: string;
  institutionId: string;
  accountId: string;
  date: string;       // YYYY-MM-DD
  amount: number;     // negative = debit
  currency: string;
  description: string;
  rawDescription?: string;
  category?: string;
  syncedAt: string;   // ISO timestamp
}

export interface Connector {
  readonly institutionId: string;
  run(session: Session, creds: Credentials): Promise<Transaction[]>;
}
