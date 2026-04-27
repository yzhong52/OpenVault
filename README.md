# OpenVault — Agentic Financial Aggregator

Aggregate accounts, balances, and transactions from any financial institution — without API keys, screen-scraping hacks, or third-party integrations.

- **Universal.** Traditional aggregators break when banks change their UI or revoke API access. OpenVault uses an AI agent that reads the page the same way you do — works out of the box for any bank, any UI, with no setup per institution.
- **Private.** Your credentials never leave your machine. OpenVault opens a real browser, logs in as you, and saves data locally. No third party ever sees your account information.


## Scripts

| Command | Description |
|---|---|
| `npm run login` | Claude-powered login (works for any institution) |
| `npm run wealthsimple` | Hardcoded Playwright login (Wealthsimple, no Claude) |

---

## Setup

```bash
npm install
npx playwright install chromium
```

Set environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENVAULT_WS_USERNAME=you@example.com
export OPENVAULT_WS_PASSWORD=yourpassword
```

---

## Running

```bash
# Claude-powered login (prompts for credentials if env vars not set)
npm run login

# Verbose debug mode — logs each prompt sent to Claude, pauses 1s per tool call
DEBUG=1 npm run login

# Original hardcoded Playwright script
npm run wealthsimple
```

---

## Project Structure

```
src/
  login.ts          # Claude-powered login agent (institution-agnostic)
  wealthsimple.ts   # Hardcoded Playwright login flow (reference / v1)
v0/                 # Original Rust + chromiumoxide implementation (reference)
logs/               # Accessibility snapshots saved during runs (gitignored)
```

---

## Requirements

- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable
