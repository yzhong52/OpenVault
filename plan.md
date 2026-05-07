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

New query: fetches daily balances for all accounts. We will use TypeScript to apply a "carry-forward" logic — if an account wasn't synced on a specific day, its last known balance is carried forward into the net worth sum for that date to prevent artificial drops. Returns:

```ts
{ date: string; amountCents: number }[]  // ordered by date asc
```

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
"ui": "tsx scripts/build-ui.ts"
```

`scripts/build-ui.ts` runs directly via `tsx` (keeping everything in TypeScript) and calls esbuild programmatically to bundle `src/ui/client/index.tsx` → `src/ui/dist/bundle.js`. The extension is `.js` because browsers must consume plain JavaScript, but the entire source is TypeScript.

It includes **watch mode** via esbuild's context API and can simultaneously spawn/manage the Hono server child process so that `npm run ui` hot-reloads everything in one terminal.

---

## Demo mode

`npm run ui -- --demo` passes a flag through to the server, which:
- Randomizes `amountCents` values in both API responses using the same scaling approach as the CLI (`formatCents` demo logic)
- Masks account names (e.g. "Chequing ••••" ) and institution names are left as-is

The flag is read in `server.ts` and injected into both query handlers before serializing the response.

---

## Implementation steps

1. Add dependencies
2. Write the two DB queries (`listAccounts` already exists; add `getNetWorthHistory` to `src/db/storage.ts` with TS carry-forward logic)
3. Build `server.ts` (Hono, two API routes, serve `dist/bundle.js` + inline HTML shell, `--demo` flag support using `formatCents`)
4. Build client components (`App`, `NetWorthChart`, `AccountsTable` in TSX)
5. Write `scripts/build-ui.ts` (adding esbuild watch logic)
6. Wire up `npm run ui` script
7. Smoke test with real DB data
