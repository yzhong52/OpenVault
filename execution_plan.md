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
| Browser automation | `chromiumoxide` | Full async CDP, complete protocol coverage, Tokio-native |
| Accessibility snapshot | CDP `Accessibility.getFullAXTree` via chromiumoxide | No screenshot needed; semantic tree |
| Network interception | `chromiumoxide` Network domain | Capture XHR JSON responses directly |
| Agent loop / LLM | `reqwest` + Claude API (raw HTTP) | No official Rust SDK — `reqwest` is more reliable than community crates |
| Database | `rusqlite` (SQLite) | Local-only, zero setup, sufficient for prototype |
| CLI | `clap` | Standard Rust CLI library |
| Credential store | `keyring` | OS keychain (Keychain on macOS, libsecret on Linux) |
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
│   │   ├── snapshot.rs          # Accessibility tree extraction + formatting
│   │   ├── claude.rs            # Claude API client (reqwest)
│   │   └── tools.rs             # Tool definitions for the agent
│   ├── browser/
│   │   ├── mod.rs               # Browser session management
│   │   ├── session.rs           # chromiumoxide launch, page lifecycle
│   │   ├── network.rs           # XHR/fetch response interception
│   │   └── actions.rs           # click, type, navigate wrappers
│   ├── connectors/
│   │   ├── mod.rs               # Connector trait
│   │   └── td.rs                # TD EasyWeb connector
│   ├── db/
│   │   ├── mod.rs               # DB connection + migrations
│   │   ├── schema.rs            # Table definitions
│   │   └── transactions.rs      # Insert / query transactions
│   └── credentials/
│       └── mod.rs               # keyring read/write per institution
```

---

## Core Interfaces

### Connector Trait
```rust
#[async_trait]
pub trait Connector {
    fn institution_id(&self) -> &str;
    async fn login(&self, session: &BrowserSession) -> Result<()>;
    async fn fetch_transactions(&self, session: &BrowserSession) -> Result<Vec<RawTransaction>>;
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
openvault sync --all           # run all configured connectors
openvault list                 # list recent transactions (last 30 days)
openvault list --account td    # filter by institution
openvault credentials set td   # save TD credentials to OS keychain
openvault status               # show last sync time per institution
```

---

## Agent Loop Design

The agent loop drives each connector. It does not use hardcoded selectors — it reasons about the page state at each step.

```
1. Take accessibility snapshot of current page
2. Send snapshot + task context to Claude
3. Claude returns next action (click ref, type text, navigate, or done)
4. Execute action via browser
5. Check network log for intercepted JSON responses
6. If transaction JSON found → extract and return
7. If not done → go to step 1
8. If MFA detected → pause and prompt user in CLI
```

### Snapshot Format for Claude

The accessibility tree from CDP is verbose. Before sending to Claude, format it as a compact text tree with only role, name, and ref:

```
[button @e1] "Sign In"
[textbox @e2] "Username" (value: "")
[textbox @e3] "Password" (value: "")
[link @e4] "Forgot password?"
```

This mirrors what OpenClaw's `pw-role-snapshot.ts` does — and stays well under 2k tokens per page.

### Tool Definitions (Claude tool use)
```json
[
  {
    "name": "click",
    "description": "Click an element by its ref",
    "input_schema": { "ref": "string" }
  },
  {
    "name": "type",
    "description": "Type text into an element",
    "input_schema": { "ref": "string", "text": "string" }
  },
  {
    "name": "navigate",
    "description": "Navigate to a URL",
    "input_schema": { "url": "string" }
  },
  {
    "name": "snapshot",
    "description": "Take a fresh accessibility snapshot of the current page",
    "input_schema": {}
  },
  {
    "name": "wait_for_mfa",
    "description": "Pause and prompt the user to complete MFA in the browser",
    "input_schema": {}
  },
  {
    "name": "done",
    "description": "Signal that the task is complete",
    "input_schema": { "result": "string" }
  }
]
```

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

## Network Interception Strategy

Register a response listener before any navigation. TD's SPA likely fires an internal API call when loading transaction history — capture it before attempting any DOM extraction:

```rust
// Intercept all XHR responses, filter for likely transaction endpoints
page.enable_fetch(None, Some(true)).await?;
page.event_listener::<EventResponseReceived>().await
    .filter(|e| is_likely_transaction_response(&e.response.url))
    .map(|e| extract_body(e))
```

If a JSON response is captured with transaction data, the connector returns immediately — no snapshot parsing needed for that step.

---

## MFA Handling (CLI)

When the agent calls `wait_for_mfa`:
1. Print to terminal: `[OpenVault] MFA required. Complete verification in the browser window, then press Enter to continue.`
2. Browser remains open and visible
3. User completes SMS/push/OTP in the real browser
4. CLI resumes on Enter
5. Agent takes a fresh snapshot and continues

---

## Phased Execution

### Phase 0 — Scaffold (1–2 days)
- [ ] Init Rust project, add all crates to `Cargo.toml`
- [ ] Implement `browser/session.rs`: launch chromiumoxide, open page, close
- [ ] Implement `agent/snapshot.rs`: call `Accessibility.getFullAXTree` via CDP, format to compact text
- [ ] Verify snapshot output looks reasonable on a test page

### Phase 1 — Agent Loop (2–3 days)
- [ ] Implement `agent/claude.rs`: send messages + tools to Claude API via reqwest, stream response
- [ ] Implement `agent/tools.rs`: execute click/type/navigate/snapshot actions
- [ ] Wire up the observe → reason → act loop
- [ ] Test on a simple public form (not TD yet)

### Phase 2 — TD Connector (2–3 days)
- [ ] Implement `credentials/mod.rs`: store/retrieve TD credentials via keyring
- [ ] Add network interception in `browser/network.rs`
- [ ] Implement `connectors/td.rs` with the login + transaction fetch flow
- [ ] Handle MFA pause/resume in CLI
- [ ] Run against TD EasyWeb sandbox / real account

### Phase 3 — Database + CLI (1–2 days)
- [ ] Implement `db/`: SQLite schema, migrations, insert/query
- [ ] Normalize raw TD transaction data into canonical schema
- [ ] Implement all `clap` CLI commands
- [ ] `openvault sync td` → end-to-end working

---

## Key Risks

| Risk | Mitigation |
|---|---|
| TD detects automation (bot fingerprint) | chromiumoxide launches real Chrome; add realistic delays between actions |
| TD changes login UI | Agentic approach adapts — no hardcoded selectors |
| MFA not handled gracefully | wait_for_mfa tool pauses the loop; user retains control |
| Accessibility tree missing key elements | Fall back to filtered DOM via `Runtime.evaluate` JS injection |
| XHR response not JSON (encrypted/obfuscated) | Fall back to CSV export download flow |
| keyring unavailable on some systems | Fall back to AES-256 encrypted file store |
