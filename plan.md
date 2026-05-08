# UI Improvement Plan

## 1. URL-based routing

**Current state:** Page is controlled by `useState` in `App.tsx`. Navigating to `/accounts`
is not possible — refreshing or sharing a link always lands on Dashboard.

**Goal:** Use the browser History API (`history.pushState` / `popstate`) to map:
- `/` → Dashboard
- `/accounts` → Accounts

No external router dependency — the native API is sufficient for two routes.

**Scope:**
- `App.tsx` — read `window.location.pathname` for initial page, call `history.pushState`
  on navigation, listen to `popstate` for back/forward support
- `Sidebar.tsx` — replace `onClick` state setter with navigation helper
- `server.ts` — serve `index.html` for all non-API, non-asset routes (so deep links work
  on refresh)

---

## 2. Extract HTML shell from server.ts

**Current state:** The HTML document (doctype, head, fonts, inline `<style>`, root div) is
a template literal inside `server.ts`. CSS global styles (scrollbar, fonts, color resets)
are inline in the server response.

**Goal:** Move the HTML shell to `src/ui/public/index.html` and serve it as a static file.
`server.ts` becomes a pure API + static asset server.

**Scope:**
- Create `src/ui/public/index.html` with the extracted markup and global styles
- Update `server.ts` to serve `index.html` for the root route (and all deep-link routes
  after task 1)
- Remove the template literal from `server.ts`

---

## 3. Fix demo mode query param

**Current state:** `api.ts` reads `?demo=` once at module load time. If the page is loaded
without the param and then navigated to with it (or vice versa), demo mode does not update.

**Goal:** Read `window.location.search` reactively inside each `fetch*` call, so demo mode
always reflects the current URL.

**Scope:**
- `api.ts` — move param extraction into `fetchAccounts()` and `fetchNetWorth()` bodies
- `App.tsx` — ensure data is re-fetched when the URL changes (relevant once routing lands)

---

## 4. Delete unused NetWorthChart component

**Current state:** `src/ui/client/NetWorthChart.tsx` exists but is not imported anywhere.
Dashboard renders its own inline AreaChart.

**Goal:** Delete the file.

---

## Order of execution

1. Task 4 (delete unused file) — trivial, no risk
2. Task 2 (extract HTML shell) — isolated to `server.ts` + new `index.html`
3. Task 3 (fix demo param) — small, self-contained change to `api.ts`
4. Task 1 (URL routing) — builds on tasks 2 & 3; touches `App.tsx`, `Sidebar.tsx`,
   `server.ts`
