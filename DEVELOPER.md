# Developer Notes

## What lives where

Runtime state is stored outside the repo in `~/.ledgeragent/`:

- `accounts.json` — saved institutions and usernames
- `config.json` — non-secret config such as Gmail address
- `data.db` — SQLite database with institutions, accounts, syncs, and balances
- `logs/` — saved accessibility snapshots for debugging agent runs
- `memory/*.md` — per-institution agent notes injected into future prompts
- `browser-profile/` — persistent Chrome profile used during syncs

Passwords are not stored in those files. Institution and Gmail credentials live in macOS Keychain via `src/keychain.ts`.

## Useful commands

Sync a single institution instead of all:

```bash
npm run cli -- sync --institution TD
```

Debug mode — logs each prompt sent to Claude and pauses 1s between tool calls:

```bash
DEBUG=1 npm run cli -- sync
```

Add an institution:

```bash
npm run cli -- institution add
```

Configure Gmail for automatic MFA:

```bash
npm run cli -- config gmail
```

List all stored accounts and their latest balances:

```bash
npm run cli -- accounts list
```

Accessibility snapshots are saved to `~/.ledgeragent/logs/<timestamp>_<institution>/snapshots/snapshot_<task>_NNN.txt`, useful for diagnosing selector issues.

Only the 20 most recent log sessions overall are retained. Older generated session folders are pruned automatically.

## Agent memory

Per-institution notes live in `~/.ledgeragent/memory/<institution>.md`.

- Each file is Markdown with sections like `## login` and `## accounts`.
- Notes are written only after successful task completion.
- `src/tasks/login.ts` and `src/tasks/accounts.ts` both load notes for their task and inject them into the next system prompt.
- `src/memory.ts` filters out empty or obviously bogus summaries before saving.

If a memory file looks wrong, open it directly and inspect the task section for that institution. If needed, you can edit or delete the file and let the next successful run regenerate it.

## Debugging login issues

- Re-run with `DEBUG=1` to see each Claude tool call and tool result.
- Check `~/.ledgeragent/logs/*/snapshots/*.txt` to inspect the ARIA snapshots the agent actually saw.
- If the institution uses a multi-step or unusual login widget, start by reproducing it with `npm run cli -- sync --institution "<name>"` before changing prompts or tools.
- If MFA is involved, confirm whether the code was expected from Gmail or manual entry.

## Inspecting synced data

Data is stored in `~/.ledgeragent/data.db` (SQLite). To query it:

```bash
sqlite3 ~/.ledgeragent/data.db "
  SELECT i.name, a.name, a.type, b.amount_cents
  FROM balances b
  JOIN accounts a ON a.id = b.account_id
  JOIN institutions i ON i.id = a.institution_id
  ORDER BY b.id DESC LIMIT 20;
"
```

## Regenerating DB migrations

After changing `src/db/schema.ts`, generate a new migration:

```bash
npm run db:generate
```

Migrations in `drizzle/` are applied automatically at startup via `migrate()` in `src/db/index.ts`.
