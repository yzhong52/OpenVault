# Backlog

## Critical

---

## Medium

### Demo mode leaks real `costBasisCents` in `/api/holdings`
`src/ui/server.ts` — demo transform randomizes `marketValueCents` and `pricePerUnitCents` but
leaves `costBasisCents` as real data. Scale it proportionally or set to `null`.

### `isDemoDebt` type check is wrong case — credit accounts show as assets in demo
`src/ui/server.ts` — compares `type === 'credit'` and `type === 'loan'` but stored values are
title-case (`'Credit'`, `'Mortgage'`, `'Line of Credit'`). Fix: check
`accountCategory === 'Credit'` instead, which is reliable and already available.

### `listHoldings` does a full table scan then filters in JS
`src/db/storage.ts` — fetches every holdings row ever recorded across all dates, then filters
to the latest date per account in application code. Fine now, but will degrade with long
history. Fix with a `WHERE date = (SELECT MAX(date) FROM holdings h2 WHERE h2.account_id =
holdings.account_id)` subquery.

---

## Low

### Account rows keyed on non-unique `accountId` in React
`src/ui/client/AccountsTable.tsx` — account rows use `key={a.accountId}` (institution-reported
string, e.g. last 4 digits). If two accounts share the same string, React gets duplicate keys
and may misrender. Fix: expose the surrogate `id` PK in `AccountRow` and use that as the key.

### `normalizeCategory` silently drops unknown values with no warning
`src/db/storage.ts` — unlike `normalizeType` which falls back to `raw.toLowerCase()`, unknown
categories are silently discarded and stored as `null`, causing the account to never trigger
holdings sync. At minimum log a warning.

---

## Notes / Product Decisions

### Managed Investment holdings scrape likely returns empty
`src/commands/accounts.ts` — `exploreHoldings` is called for both `Brokerage` and
`Managed Investment` accounts, but managed/robo-advisor pages typically don't expose individual
positions. The agent will either return empty or noisy results. Consider skipping holdings sync
for `Managed Investment` or handling the empty case more explicitly.
