# Investment Support Plan — Net Worth Tracking

## Context

OpenVault currently tracks bank/credit accounts via a `balances` table (daily snapshots in cents)
and a `transactions` table (signed cash flows). Net worth is computed by summing all account
balances on each day.

Investment accounts are fundamentally different: value changes continuously due to market prices,
not just when a transaction occurs. The goal here is net worth accuracy — we do NOT need real-time
prices, just a point-in-time snapshot every time the user syncs.

---

## Proposed Database Changes

### New table: `holdings`

Stores a snapshot of every investment position at the time of a sync. One row per position per
sync.

```sql
holdings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  accountId      INTEGER NOT NULL,  -- FK → accounts.id (surrogate PK)
  syncId         INTEGER NOT NULL,  -- FK → syncs.id
  symbol         TEXT    NOT NULL,  -- e.g. "XEQT", "AAPL", "BTC"
  name           TEXT,              -- display name, e.g. "iShares Core Equity ETF"
  quantity       REAL    NOT NULL,  -- number of units/shares held
  pricePerUnit   INTEGER NOT NULL,  -- in cents at time of sync
  marketValue    INTEGER NOT NULL,  -- quantity × pricePerUnit, in cents
  costBasis      INTEGER,           -- nullable — only if brokerage exposes it
  currency       TEXT,
  UNIQUE (accountId, syncId, symbol)
)
```

The same symbol (e.g. `VFV`) can appear in multiple rows with different `accountId` values — one
per account that holds it. The unique constraint prevents duplicate inserts if the agent runs
twice for the same sync.

**Why link to `syncId` and not `date`?**
Multiple syncs could occur on the same day. Linking to `syncId` lets us always pick the latest
snapshot per day without ambiguity.

### Changes to existing tables

| Table | Change | Reason |
|-------|--------|--------|
| `accounts` | No change needed | `type` is already a free-form text field — the agent can write `"tfsa"`, `"rrsp"`, `"margin"`, `"crypto"` directly into it |
| `syncs` | No change needed | Already records per-institution sync time |
| `balances` | No change needed | Investment account balance (total market value) is written here by the sync agent, same as today |
| `transactions` | No change needed | Buy/sell history is out of scope for net worth tracking; revisit when investment transactions are added |

**Net worth calculation stays the same.** The `balances` table already holds a single total per
account per date. For investment accounts the agent writes the total portfolio market value as
that balance — same query, no schema changes needed for net worth.

### No `investment_transactions` table yet

Buy/sell history is useful for tax reporting and performance tracking but is out of scope for net
worth. We can add it later once holdings sync is stable.

---

## Proposed UI Changes

### 1. Dashboard — Holdings breakdown panel (new)

Below the existing institution breakdown, add a collapsible **Top Holdings** section when at least
one investment account is present. Shows the top N positions by market value across all investment
accounts, with symbol, name, current value, and percentage of total portfolio.

```
Top Holdings
─────────────────────────────────────────
  XEQT   iShares Core Equity ETF   $42,300  16.4%
  VFV    Vanguard S&P 500 ETF      $28,100  10.9%
  BTC    Bitcoin                   $12,500   4.8%
  ...
```

This is purely display — no interaction needed for v1.

### 2. Accounts page — Holdings drill-down (new)

In the existing collapsible accordion per institution, add a sub-row under each investment account
that expands to show its individual holdings (symbol, name, quantity, price, market value). Uses
the same chevron expand/collapse pattern already in use.

```
▼  Wealthsimple                        $82,900
     TFSA (self-directed)              $42,300  ▶
       ▼ Holdings
         XEQT    100 units  @ $423.00  $42,300
     RRSP                              $40,600  ▶
```

### 3. Account type badges (update)

Currently account `type` (chequing, savings, credit, investment) is shown as plain text. Add a
color-coded badge for investment subtypes: TFSA, RRSP, FHSA, margin, crypto. This helps
distinguish tax-advantaged accounts at a glance.

### 4. Net worth chart — no change needed

The chart already plots the sum of all account balances over time. Because we write total market
value into `balances` for investment accounts, the chart will automatically reflect portfolio
value changes after each sync — no UI changes required.

---

## Proposed Agent / Sync Changes

### New task: `tasks/holdings.ts`

A new agent task (mirrors the pattern of `tasks/accounts.ts`) that runs after accounts sync for
investment institutions. It navigates to the portfolio/holdings page and extracts:

- Symbol or ticker
- Holding name
- Quantity held
- Current price per unit
- Total market value
- Cost basis (if shown)

Output is written to the `holdings` table via a new `saveHoldings()` function in `src/db/storage.ts`.

### `commands/accounts.ts` — orchestration update

After accounts sync succeeds for an institution, check if any synced account has `type =
"investment"`. If so, automatically run the holdings task for that institution. No new CLI
command needed — holdings sync is part of `accounts sync`.

---

## Phased rollout

| Phase | Work |
|-------|------|
| **1 — Schema** | Add `holdings` table migration; add `subtype` to accounts |
| **2 — Agent** | Build `tasks/holdings.ts`; add `saveHoldings()` to storage; wire into accounts sync |
| **3 — UI** | Add holdings drill-down in accounts page; add Top Holdings panel on dashboard |

Phase 1 is safe to ship independently (no breaking changes). Phases 2 and 3 can be developed in
parallel once Phase 1 is merged.
