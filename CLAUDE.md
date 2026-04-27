# OpenVault — Codebase Guide

## What this project does

Logs into financial institution websites using a Claude-powered Playwright agent, extracts account/transaction data, and stores it locally. The browser runs visibly (not headless) so the user can observe and handle any unexpected prompts.

## Key files

- `src/login.ts` — the main Claude-powered login agent; institution-agnostic
- `src/wealthsimple.ts` — hardcoded Playwright login for Wealthsimple (no Claude); used as a reference and fallback
- `v0/` — original Rust + chromiumoxide implementation; kept for reference only, not built

## Running

```bash
npm run login          # Claude agent (Wealthsimple entry point)
DEBUG=1 npm run login  # Verbose: logs prompts to Claude + 1s pause per tool call
npm run wealthsimple   # Hardcoded Playwright script
```

Credentials are read from env vars; the script prompts interactively if not set:
- `OPENVAULT_WS_USERNAME`
- `OPENVAULT_WS_PASSWORD`
- `ANTHROPIC_API_KEY`

## Architecture of login.ts

Instead of scraping HTML, OpenVault reads the page's ARIA accessibility tree after each action. This is far more compact than raw HTML and more stable than CSS selectors — elements are targeted by what they *are*, not where they happen to sit in the DOM:

```
- document "Investing summary | Wealthsimple":
  - navigation:
    - link "Investing"
    - link "Tax"
  - heading "Total equity" [level=2]
  - text "$258,486.25"
```

The agent loop in `login()` sends this snapshot to Claude, executes the returned tool calls, feeds results back, and repeats until Claude calls `success`:

```
snapshot → Claude → tool call → execute → snapshot → …
```

**Tools available to Claude:**

| Tool | What it does |
|---|---|
| `snapshot` | Returns `page.locator('body').ariaSnapshot()` |
| `fill` | Fills a form field by ARIA role + name using Playwright `fill()` (no key events) |
| `type` | Types character-by-character via `pressSequentially()` (fires key events; required for OTP fields) |
| `click` | Clicks by ARIA role + name; waits for `domcontentloaded` with 3s timeout |
| `click_testid` | Clicks by `data-testid`; escape hatch when role/name matches multiple elements |
| `request_mfa_code` | Pauses and prompts the user for an OTP code, returns it to Claude as the tool result |
| `success` | Terminates the loop |

**MFA flow:** When Claude sees an OTP screen it calls `request_mfa_code` — the tool pauses and prompts the user for the code, then returns it to Claude as the tool result. Claude fills it in and continues. No manual handoff needed.

**Why `domcontentloaded` not `load` after clicks:** Wealthsimple and similar SPAs never fire a second `load` event during in-app navigation. Using `load` hangs indefinitely; `domcontentloaded` with a catch is the safe alternative.

**Why two fill tools:** `fill()` is fast and reliable for text inputs. OTP fields in SPAs often gate the submit button on keystroke events, which `fill()` doesn't fire. `pressSequentially()` simulates real typing.

**Error handling in tool execution:** Playwright errors (e.g. strict mode violations when a locator matches multiple elements) are caught and returned to Claude as the tool result string. Claude can then retry with a more specific selector (e.g. `click_testid`).

## Adding a new institution

1. Add a new entry point at the bottom of `src/login.ts` (or a new file) with the institution's login URL
2. Add an npm script in `package.json`
3. The login agent is institution-agnostic — no other changes needed unless the site has unusual behaviour

## Logs

Accessibility snapshots are saved to `logs/ws_<label>.txt` after each major step. These are gitignored and useful for debugging selector issues.
