# OpenVault — Execution Plan
_2026-03-30 | Prototype: TD Canada Trust transaction download_

---

## Goal

A Rust CLI that:
1. Logs into TD EasyWeb
2. Navigates to transaction history
3. Extracts recent transactions via accessibility snapshot + network interception
4. Stores them in a local SQLite database
5. Exposes a simple CLI to trigger sync and query results

No UI. No cloud. All local.

---

## Tech Stack

| Component | Crate | Why |
|---|---|---|
| Browser automation | `chromiumoxide 0.9` | Full async CDP, Tokio-native, Chrome 146 compatible |
| Accessibility snapshot | CDP `Accessibility.getFullAXTree` via chromiumoxide | No screenshot needed; semantic tree |
| Network interception | `chromiumoxide` Network domain | Capture XHR JSON responses directly |
| Agent loop / LLM | `reqwest` + Claude API (raw HTTP) | No official Rust SDK — `reqwest` is more reliable than community crates |
| Database | `rusqlite` (SQLite) | Local-only, zero setup, sufficient for prototype |
| CLI | `clap` | Standard Rust CLI library |
| Credential store | `keyring` with `apple-native` feature | macOS Keychain — feature flag is required or it silently uses an in-memory mock |
| Async runtime | `tokio` | Required by chromiumoxide |
| Serialization | `serde` + `serde_json` | JSON handling throughout |
| Error handling | `anyhow` | Ergonomic error propagation |

---

## Project Structure

```
openvault/
├── Cargo.toml
├── src/
│   ├── main.rs                  # CLI entry point (clap)
│   ├── cli.rs                   # CLI command definitions
│   ├── agent/
│   │   ├── mod.rs               # Agent loop: observe → reason → act
│   │   ├── claude.rs            # Claude API client (reqwest), tool_choice: any
│   │   └── tools.rs             # Tool execution dispatch
│   ├── browser/
│   │   ├── mod.rs               # Session: launch, snapshot, resolve refs
│   │   ├── snapshot.rs          # CDP accessibility tree → compact text + ref map
│   │   ├── network.rs           # XHR/fetch response interception
│   │   └── actions.rs           # click/type/navigate via XPath candidates + CSS fallback
│   ├── connectors/
│   │   ├── mod.rs               # Connector trait + registry
│   │   └── td.rs                # TD EasyWeb connector
│   ├── db/
│   │   └── mod.rs               # SQLite: schema, migrations, insert, query, sync log
│   └── credentials/
│       └── mod.rs               # keyring read/write + env var override
```

---

## Core Interfaces

### Connector Trait
```rust
#[async_trait]
pub trait Connector {
    fn institution_id(&self) -> &str;
    async fn run(&self, session: &Session, creds: Credentials) -> Result<Vec<Transaction>>;
}
```

### Canonical Transaction Schema (SQLite)
```sql
CREATE TABLE transactions (
    id              TEXT PRIMARY KEY,   -- hash of institution+account+date+amount+desc
    institution_id  TEXT NOT NULL,
    account_id      TEXT NOT NULL,
    date            TEXT NOT NULL,      -- ISO 8601
    amount          REAL NOT NULL,      -- negative = debit
    currency        TEXT NOT NULL DEFAULT 'CAD',
    description     TEXT NOT NULL,
    raw_description TEXT,
    category        TEXT,
    synced_at       TEXT NOT NULL
);

CREATE TABLE sync_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    institution_id  TEXT NOT NULL,
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    status          TEXT NOT NULL,      -- success | failed | partial
    error           TEXT
);
```

### CLI Commands
```
openvault sync td              # run TD connector, store to DB
openvault list                 # list recent transactions (last 30 days)
openvault list --institution td --days 90
openvault credentials-set td   # save TD credentials to OS keychain
openvault status               # show last sync time per institution
```

---

## Agent Loop Design

The agent loop drives each connector with no hardcoded selectors — it reasons about the page at each step.

```
1. Take accessibility snapshot of current page (empty ok — agent navigates first)
2. Send snapshot + task context to Claude (tool_choice: any → always a tool call)
3. Claude returns next action (click ref, type text, navigate, snapshot, done)
4. Execute action via browser
5. Check network log for intercepted JSON responses
6. If transaction JSON found → extract and return
7. If not done → go to step 1
8. If MFA detected → wait_for_mfa pauses loop, user completes in browser
```

### Snapshot Format for Claude

```
[button @e1] "Sign In"
[textbox @e2] "Username or Access Card"
[textbox @e3] "Password"
[link @e4] "Forgot password?"
```

### Tool Definitions
| Tool | Input | Purpose |
|---|---|---|
| `navigate` | `url` | Go to a URL |
| `click` | `ref` | Click element by @eN ref |
| `type_text` | `ref`, `text` | Type into element |
| `snapshot` | — | Refresh accessibility snapshot |
| `wait_for_mfa` | — | Pause for user to complete MFA |
| `done` | `result` | Signal complete, return JSON |

---

## TD Canada Trust Connector — Expected Flow

Target: `https://easyweb.td.com`

```
1. navigate("https://easyweb.td.com")
2. snapshot → find username/password fields
3. type(@username_ref, credentials.username)
4. type(@password_ref, credentials.password)
5. click(@signin_ref)
6. snapshot → check for MFA prompt
   ├── MFA present → wait_for_mfa (user completes in browser)
   └── No MFA → continue
7. navigate to Accounts / Transaction History
8. CHECK network log for intercepted XHR with transaction JSON
   ├── Found → parse directly
   └── Not found → snapshot → click through to CSV export
9. done
```

---

## What's Done

### Phase 0 — Scaffold ✅
- Rust project init, all crates in `Cargo.toml`
- `browser/session.rs`: chromiumoxide launch with `--no-first-run` flags
- `browser/snapshot.rs`: `Accessibility.getFullAXTree` → compact text + ref map
- `browser/actions.rs`: XPath candidate list per role, CSS fallback
- `browser/network.rs`: XHR response URL interception

### Phase 1 — Agent Loop ✅
- `agent/claude.rs`: Claude API via reqwest, `tool_choice: any` forces tool calls
- `agent/tools.rs`: click/type/navigate/snapshot/wait_for_mfa/done
- Observe → reason → act loop with up to 30 steps

### Phase 2 — Credentials ✅
- `credentials/mod.rs`: keyring with `apple-native` feature (real macOS Keychain)
- Fixed bug: `keyring = "3"` with no features silently used in-memory mock — now uses `apple-native`
- 5 unit tests against real Keychain: round-trip, missing, overwrite, special chars, delete
- Env var override: `OPENVAULT_TD_USERNAME` / `OPENVAULT_TD_PASSWORD`

### Phase 3 — Database + CLI ✅
- `db/mod.rs`: SQLite auto-migration, insert/query, sync log start/finish/error
- `main.rs`: all CLI commands wired up, sync log recorded on every run

---

## Current Blocker: iframe Login Form

**Status:** Agent navigates to TD EasyWeb and Claude correctly identifies the login fields in the accessibility snapshot. However, `find_xpath` and `find_element` fail with `Error -32000: Invalid search result range` because TD's login form is served inside a **cross-origin iframe**.

The accessibility tree sees across iframes (hence Claude sees the fields), but DOM queries are scoped to the main document only.

### Options

| Option | Approach | Complexity |
|---|---|---|
| **A — CDP target attach** | Each iframe is a separate CDP target. Attach to it directly and run `find_xpath` there. This is how OpenClaw handles it in `cdp.ts`. | Medium |
| **B — JS `document.querySelector` in frame context** | Use `Runtime.evaluate` with the frame's `executionContextId` to run selectors inside the iframe. | Medium |
| **C — Playwright subprocess** | Call OpenClaw's existing TypeScript Playwright stack as a subprocess. Keep Rust for DB/CLI/agent loop, delegate browser control to the proven Node layer. | Low complexity, adds Node dep |

---

## Next Steps

1. **Resolve iframe login form** (one of options A/B/C above)
2. Complete first successful login to TD EasyWeb
3. Navigate to transaction history, intercept or scrape transactions
4. Verify end-to-end: `openvault sync td` → rows in SQLite → `openvault list`

---

## Key Risks

| Risk | Mitigation | Status |
|---|---|---|
| TD detects automation (bot fingerprint) | chromiumoxide launches real Chrome; `--no-first-run` flags suppress noisy startup events | Monitored |
| TD login form in cross-origin iframe | CDP target attach or frame context JS evaluation | **Active blocker** |
| TD changes login UI | Agentic approach adapts — no hardcoded selectors | Mitigated |
| MFA not handled gracefully | `wait_for_mfa` pauses loop; user retains control | Implemented |
| XHR response not JSON | Fall back to CSV export download flow | Planned |
| keyring mock store (no feature flag) | Fixed: `apple-native` feature now explicit; unit tested | Resolved ✅ |
