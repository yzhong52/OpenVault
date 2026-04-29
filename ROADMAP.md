# Roadmap

## Done

**1. Daily balance granularity**
Add a `date` column (`YYYY-MM-DD`) to `balances` with a unique constraint on `(account_id, date)`. Upsert on conflict so syncing twice in one day overwrites rather than appends. Removes unbounded growth from frequent syncs.

**2. Simplify `syncs` table**
With `date` on balances, `sync_id` as a foreign key on `balances` is redundant. Drop it from `balances`. Keep `syncs` as a lightweight audit log (when did we sync, per institution) or remove it entirely.

**3. LLM-summarized memory**
After each successful task, summarize the session into a short set of actionable notes and inject them into the next prompt for that institution.

## Next

**4. Latest balance on `accounts`**
Add `latest_balance_cents` and `latest_synced_at` columns to `accounts`, updated on each sync. Makes "show current state" queries instant without a join into the time series.

**5. Transactions task**
Implement `src/tasks/transactions.ts` so sync captures recent activity in addition to balances.

## Institution support

**6. Tangerine**
Investigate login failure via saved snapshots in `logs/`. Likely a non-standard login widget or device verification step.

**7. Questrade**
Investigate login failure. May involve bot detection or a multi-step auth flow.

**8. Schwab (Charles Schwab)**
Investigate login failure. Known for aggressive bot detection — may need `click_js` workarounds or a custom browser tool.
