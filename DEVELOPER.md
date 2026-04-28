# Developer Notes

## Useful commands

Sync a single institution instead of all:

```bash
npm run cli -- sync --institution TD
```

Debug mode — logs each prompt sent to Claude and pauses 1s between tool calls:

```bash
DEBUG=1 npm run cli -- sync
```

Accessibility snapshots are saved to `logs/<hostname>_<timestamp>_NNN.txt` after each `snapshot` tool call, useful for diagnosing selector issues.

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

## Regenerating DB migrations

After changing `src/db/schema.ts`, generate a new migration:

```bash
npm run db:generate
```

Migrations in `drizzle/` are applied automatically at startup via `migrate()` in `src/db/index.ts`.
