import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const institutions = sqliteTable('institutions', {
  id:   text('id').primaryKey(),
  name: text('name').notNull(),
  url:  text('url').notNull(),
});

export const accounts = sqliteTable('accounts', {
  id:            text('id').primaryKey(),
  institutionId: text('institution_id').notNull().references(() => institutions.id),
  name:          text('name').notNull(),
  type:          text('type'),
});

export const syncs = sqliteTable('syncs', {
  id:            integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  institutionId: text('institution_id').notNull().references(() => institutions.id),
  syncedAt:      text('synced_at').notNull(),
});

export const balances = sqliteTable('balances', {
  id:          integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  accountId:   text('account_id').notNull().references(() => accounts.id),
  syncId:      integer('sync_id', { mode: 'number' }).notNull().references(() => syncs.id),
  amountCents: integer('amount_cents'),
});
