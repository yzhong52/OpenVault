# Roadmap

## Schema improvements

**1. Daily balance granularity**
Add a `date` column (`YYYY-MM-DD`) to `balances` with a unique constraint on `(account_id, date)`. Upsert on conflict so syncing twice in one day overwrites rather than appends. Removes unbounded growth from frequent syncs.

**2. Latest balance on `accounts`**
Add `latest_balance_cents` and `latest_synced_at` columns to `accounts`, updated on each sync. Makes "show current state" queries instant without a join into the time series.

**3. Simplify `syncs` table**
With `date` on balances, `sync_id` as a foreign key on `balances` is redundant. Drop it from `balances`. Keep `syncs` as a lightweight audit log (when did we sync, per institution) or remove it entirely.

## Agent memory

**4. LLM-summarized memory**
After each successful login, pass the full session transcript to Claude and ask it to write 3–5 actionable bullet points for next time (e.g. which selectors failed, which worked, any unusual flow). Store as plain text and inject into the next session's system prompt. Replaces the current raw `{tool, input, error}` JSON approach, which only captures failures.

## Institution support

**5. Tangerine**
Investigate login failure via saved snapshots in `logs/`. Likely a non-standard login widget or device verification step.

**6. Questrade**
Investigate login failure. May involve bot detection or a multi-step auth flow.

**7. Schwab (Charles Schwab)**
Investigate login failure. Known for aggressive bot detection — may need `click_js` workarounds or a custom browser tool.
