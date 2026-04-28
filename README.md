# OpenVault — Agentic Financial Aggregator

Aggregate accounts, balances, and transactions from any financial institution — without API keys, screen-scraping hacks, or third-party integrations.

- **Universal.** Traditional aggregators break when banks change their UI or revoke API access. OpenVault uses an AI agent that reads the page the same way you do — works out of the box for any bank, any UI, with no setup per institution.
- **Private.** Your credentials never leave your machine. OpenVault opens a real browser, logs in as you, and saves data locally. No third party ever sees your account information.

## Setup

```bash
npm install
npx playwright install chromium
```

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

**Add an institution** (saves credentials to macOS Keychain):

```bash
npm run cli -- institution add
```

You'll be prompted for the institution name, login URL, username or email, and password. Credentials are stored in the macOS Keychain — you won't be asked again.

**Sync all institutions:**

```bash
npm run cli -- sync
```

**Sync a single institution** by name:

```bash
npm run cli -- sync --institution TD
```

Opens a real Chrome window, logs into each saved institution, extracts all accounts and balances, and saves them to a local SQLite database.

**Debug mode** — logs each prompt sent to Claude and pauses 1s per tool call:

```bash
DEBUG=1 npm run cli -- sync
```

## MFA

OpenVault handles MFA automatically when possible. When a verification code screen appears, it first checks your Gmail inbox for the code — if found, it fills it in without any input from you. If Gmail isn't configured or no code arrives within 60 seconds, it falls back to prompting you to enter the code manually.

**Configure Gmail for automatic MFA** (one-time setup):

```bash
npm run cli -- config gmail
```

See [faq/how_to_config_gmail_for_mfa.md](faq/how_to_config_gmail_for_mfa.md) for setup instructions, including how to forward SMS codes to Gmail if your institution sends MFA codes by text.

## Inspecting synced data

Data is stored in `~/.openvault/data.db` (SQLite). To query it:

```bash
sqlite3 ~/.openvault/data.db "
  SELECT i.name, a.name, a.type, b.amount_cents
  FROM balances b
  JOIN accounts a ON a.id = b.account_id
  JOIN institutions i ON i.id = a.institution_id
  ORDER BY b.id DESC LIMIT 20;
"
```

## Project structure

```
src/
  cli.ts              # CLI entry point
  keychain.ts         # macOS Keychain helpers
  config.ts           # ~/.openvault/config.json read/write
  storage.ts          # Save sync results to SQLite via Drizzle ORM
  gmail.ts            # Gmail IMAP polling for MFA codes
  agent/
    index.ts          # Generic Claude agent loop
    browser.ts        # Shared Playwright tool definitions and executors
  tasks/
    login.ts          # Claude-powered login agent (institution-agnostic)
    accounts.ts       # Claude-powered account discovery agent
  db/
    schema.ts         # Drizzle table definitions
    index.ts          # DB connection and auto-migration
drizzle/              # SQL migration files (auto-applied at startup)
faq/                  # Setup guides
~/.openvault/
  accounts.json       # Saved institution metadata (no passwords)
  config.json         # Non-sensitive config (e.g. Gmail address)
  data.db             # Synced account and balance history (SQLite)
  browser-profile/    # Persistent Chrome profile (avoids re-authentication)
```

## Requirements

- Node.js 18+
- macOS (Keychain is used for credential storage)
- Google Chrome installed
- `ANTHROPIC_API_KEY` environment variable
