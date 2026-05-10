# Rebrand: OpenVault → LedgerAgent

## Scope

46 occurrences across 16 files. Changes fall into three categories:

1. **Display name** — `OpenVault` → `LedgerAgent`
2. **Slug/identifier** — `openvault` → `ledgeragent`
3. **Data directory** — `~/.openvault/` → `~/.ledgeragent/`

---

## File-by-file changes

### Source code

| File | What changes |
|---|---|
| `src/cli.ts` | `.name('openvault')` → `.name('ledgeragent')` |
| `src/keychain.ts` | `const SERVICE = 'openvault'` → `'ledgeragent'` |
| `src/db/index.ts` | `DATA_DIR` path: `.openvault` → `.ledgeragent` |
| `src/commands/utils.ts` | `OPENVAULT_PROFILE_DIR` env var → `LEDGERAGENT_PROFILE_DIR`; path `.openvault` → `.ledgeragent` |
| `src/commands/config.ts` | Display text: `OpenVault` → `LedgerAgent` |
| `src/ui/server.ts` | Log message: `OpenVault UI server` → `LedgerAgent UI server` |
| `src/ui/client/App.tsx` | Storage key: `openvault:demo` → `ledgeragent:demo` |
| `src/ui/client/Sidebar.tsx` | alt text + display text: `OpenVault` → `LedgerAgent` |
| `src/ui/public/index.html` | `<title>OpenVault</title>` → `<title>LedgerAgent</title>` |

### Config files

| File | What changes |
|---|---|
| `package.json` | `"name": "openvault"` → `"ledgeragent"` |
| `package-lock.json` | `"name": "openvault"` (2 occurrences) → `"ledgeragent"` |
| `drizzle.config.ts` | DB path: `.openvault` → `.ledgeragent` |

### Documentation

| File | What changes |
|---|---|
| `README.md` | All `OpenVault` display names + all `~/.openvault/` paths |
| `CLAUDE.md` | All `OpenVault` display names + all `~/.openvault/` paths |
| `DEVELOPER.md` | All `~/.openvault/` paths |
| `faq/how_to_config_gmail_for_mfa.md` | All `OpenVault` display names |

---

## Data directory migration note

The runtime data directory changes from `~/.openvault/` to `~/.ledgeragent/`. Existing users will need to rename (or copy) their data directory manually:

```bash
mv ~/.openvault ~/.ledgeragent
```

This is **out of scope** for the code changes — no migration script is included. The plan.md will note this as a manual step for existing users.

---

## Execution order

1. Source code files (functional changes first)
2. Config files (`package.json`, `package-lock.json`, `drizzle.config.ts`)
3. Documentation files (`README.md`, `CLAUDE.md`, `DEVELOPER.md`, `faq/`)
