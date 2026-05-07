# OpenVault UI — Plan

## Goal

A local web dashboard at `localhost:3000` with two sections:
- **Top:** Net worth over time (line chart, daily granularity, all accounts summed)
- **Bottom:** Latest account balances table (mirrors `accounts list` CLI output)

Single command: `npm run ui`

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Server | [Hono](https://hono.dev/) + `@hono/node-server` | Tiny, serves API + static assets in one process |
| Client | React + ReactDOM | Component model; works with Recharts |
| Chart | [Recharts](https://recharts.org/) | Declarative, well-documented, good defaults |
| Bundler | esbuild | Already a transitive dep via tsx; millisecond builds |

No Webpack, no Vite, no separate dev server.

---

## New dependencies

```
hono @hono/node-server
react react-dom
recharts
esbuild
@types/react @types/react-dom
```

---

## File structure

```
src/ui/
  server.ts          # Hono app: API routes + serves index.html + bundle.js
  client/
    index.tsx        # React root (ReactDOM.render)
    App.tsx          # Layout: NetWorthChart on top, AccountsTable below
    NetWorthChart.tsx
    AccountsTable.tsx
    api.ts           # fetch helpers for /api/net-worth and /api/accounts
```

---

## API routes

### `GET /api/accounts`

Reuses `listAccounts()` from `src/db/storage.ts`. Returns JSON array of:

```ts
{
  institutionName: string
  accountName: string
  accountType: string | null
  accountCurrency: string | null
  latestDate: string | null
  amountCents: number | null
}[]
```

### `GET /api/net-worth`

New query: aggregate `balances` by date, summing `amountCents` across all accounts. Returns:

```ts
{ date: string; amountCents: number }[]  // ordered by date asc
```

Sums whatever accounts have a balance on each day — no filtering for "complete" days. This means earlier dates may reflect fewer accounts, but data appears as soon as any account has history.

---

## Client layout

```
┌─────────────────────────────────┐
│  Net Worth Over Time            │
│  [Recharts LineChart]           │
│  X: date   Y: $ amount          │
├─────────────────────────────────┤
│  Institution  Account  Type  Balance  │
│  TD           Chequing  ...   $x,xxx  │
│  ...                                  │
└─────────────────────────────────┘
```

- Y-axis formatted as `$x,xxx` (dollars, not cents)
- Tooltip shows exact date + total
- Table sorted by institution then account name (same as CLI)

---

## npm script

```json
"ui": "node scripts/build-ui.mjs && tsx src/ui/server.ts"
```

`scripts/build-ui.mjs` calls esbuild programmatically to bundle `src/ui/client/index.tsx` → `src/ui/dist/bundle.js`. Keeping it in a separate file makes flags easy to read and change.

Build takes ~200ms. On save, re-run `npm run ui` (no watch needed for a personal tool).

---

## Demo mode

`npm run ui -- --demo` passes a flag through to the server, which:
- Randomizes `amountCents` values in both API responses using the same scaling approach as the CLI (`formatCents` demo logic)
- Masks account names (e.g. "Chequing ••••" ) and institution names are left as-is

The flag is read in `server.ts` and injected into both query handlers before serializing the response.

---

## Implementation steps

1. Add dependencies
2. Write the two DB queries (`listAccounts` already exists; add `getNetWorthHistory` to `src/db/storage.ts`)
3. Build `server.ts` (Hono, two API routes, serve `dist/bundle.js` + inline HTML shell, `--demo` flag support)
4. Build client components (`App`, `NetWorthChart`, `AccountsTable`)
5. Write `scripts/build-ui.mjs`
6. Wire up `npm run ui` script
7. Smoke test with real DB data
