import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DATA_DIR } from '../db';
import { ACCOUNT_TOOL, BROWSER_TOOL, LOGIN_TOOL, TRANSACTION_TOOL } from './tools';
import { normalizeSnapshot } from './utils/normalizeSnapshot';

export { normalizeSnapshot };

// Bump this whenever the CacheData shape changes — mismatched files are discarded and rebuilt.

const CACHE_VERSION = 3;
const VERBOSE = process.env.VERBOSE === '1' || process.env.DEBUG === '1';

/** SHA-256 of a normalized snapshot, truncated to 16 hex characters. */
type Fingerprint = string;

export interface CachedAction {
  /** Tool name, e.g. "click", "fill", "snapshot". */
  name: string;
  /** Tool input as received from the Anthropic API. Keys are parameter names
   *  and values are strings or booleans — e.g. `{ role: "button", name: "Log in" }`
   *  for `click`. Typed as `unknown` rather than `any` to require an explicit cast before use. */
  input: Record<string, unknown>;
}

interface CacheData {
  /** Incremented when the file format changes; mismatches cause the file to be discarded. */
  version: number;
  steps: Record<Fingerprint, CachedAction[]>;
  /** ISO 8601 timestamp of the last write. Informational only — never read back. */
  updatedAt: string;
}

// Tool inputs containing these field names hold credential values — don't cache them.
const SENSITIVE_FIELD_RE = /password|passcode|pin|secret|cvv|ssn/i;

// Tools that must never be cached. Observation tools (snapshot, frame_snapshot,
// get_inputs) are excluded because caching "look at the page" causes replay loops —
// replaying a snapshot sets pendingSnapshot, which can hit another snapshot entry,
// and so on indefinitely. Report tools are excluded because they embed live session data.
const NON_CACHEABLE_TOOLS = new Set<string>([
  BROWSER_TOOL.SNAPSHOT,
  BROWSER_TOOL.FRAME_SNAPSHOT,
  BROWSER_TOOL.GET_INPUTS,
  ACCOUNT_TOOL.REPORT_ACCOUNTS,
  TRANSACTION_TOOL.REPORT_TRANSACTIONS,
]);

function fp(snapshot: string): Fingerprint {
  // Truncate to 16 hex chars (64 bits). Collision probability among N keys is
  // ~N²/2⁶⁴ — negligible for the ~10–20 distinct pages a typical institution
  // has. The full 64-char SHA-256 would also work; this just keeps the JSON readable.
  return crypto.createHash('sha256').update(normalizeSnapshot(snapshot)).digest('hex').slice(0, 16);
}

/** Stable JSON stringify — sorts keys so { a, b } and { b, a } compare equal. */
function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))),
  );
}

/** Returns false for tools whose inputs contain live data that must not be persisted.
 *  Note: username fills ARE cached (only password-like field names are excluded).
 *  Usernames are stored in plaintext in the cache file, which lives in ~/.openvault/. */
function isCacheable(toolName: string, input: Record<string, unknown>): boolean {
  if (NON_CACHEABLE_TOOLS.has(toolName)) return false;
  const isCredentialField = (toolName === LOGIN_TOOL.FILL || toolName === LOGIN_TOOL.TYPE)
    && SENSITIVE_FIELD_RE.test(String(input.name));
  if (isCredentialField) return false;
  return true;
}

// Called with a fresh timestamp each time — must be a function, not a constant.
function emptyData(): CacheData {
  return { version: CACHE_VERSION, steps: {}, updatedAt: new Date().toISOString() };
}

/** Persists a mapping of page-structure fingerprints to agent actions so that
 *  repeated runs against the same institution can skip Claude API calls for
 *  pages the agent has already seen. On a cache hit the stored action is
 *  replayed directly; on a miss or replay failure the agent falls back to
 *  Claude and updates the cache with whatever Claude does next. */
export class ActionCache {
  private data: CacheData;
  private filePath: string;
  /** True when in-memory steps differ from what's on disk; flush() writes and clears it. */
  private dirty = false;
  // Fingerprints that produced a failed replay this run — don't retry them.
  private failedFps = new Set<Fingerprint>();

  constructor(data: CacheData, filePath: string) {
    this.data = data;
    this.filePath = filePath;
  }

  /** Look up the cached actions for a snapshot. Returns null on a cache miss,
   *  or if the snapshot's fingerprint was previously marked as failed via
   *  `failSnapshot()` — in both cases the caller should fall back to Claude. */
  check(snapshot: string): CachedAction[] | null {
    const h = fp(snapshot);
    if (this.failedFps.has(h)) return null;
    return this.data.steps[h] ?? null;
  }

  /** Record the actions Claude chose in response to a snapshot, so they can be
   *  replayed on the next run. Filters out non-cacheable tools (e.g. password
   *  fills, report_accounts). No-ops if all actions are non-cacheable or if the
   *  entry is unchanged. Call this after every real Claude API response, not after replays. */
  record(snapshot: string, actions: CachedAction[]): void {
    const cacheable = actions.filter(a => isCacheable(a.name, a.input));
    if (cacheable.length === 0) return;
    const h = fp(snapshot);
    const existing = this.data.steps[h];
    const unchanged = existing !== undefined
      && existing.length === cacheable.length
      && existing.every((e, i) =>
        e.name === cacheable[i].name
        && stableStringify(e.input) === stableStringify(cacheable[i].input),
      );
    if (unchanged) return;
    this.data.steps[h] = cacheable;
    this.data.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  // Mark a snapshot's cached action as bad for this run (replay failed).
  failSnapshot(snapshot: string): void {
    this.failedFps.add(fp(snapshot));
  }

  /** Write dirty entries to disk. Only called on a fully successful run — if the
   *  agent throws, any new entries accumulated during that run are intentionally
   *  discarded to avoid caching a partial or failed sequence. */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
    this.dirty = false;
    const count = Object.keys(this.data.steps).length;
    if (VERBOSE) console.log(`💾 Page cache saved (${count} entries)`);
  }
}

async function readCacheFile(filePath: string): Promise<ActionCache> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf-8')) as CacheData;
    const invalid = raw.version !== CACHE_VERSION
      || typeof raw.steps !== 'object'
      || Array.isArray(raw.steps);
    if (invalid) {
      // Stale or corrupt — start fresh.
      return new ActionCache(emptyData(), filePath);
    }
    const count = Object.keys(raw.steps).length;
    if (VERBOSE) console.log(`📂 Loaded page cache: ${count} ${count === 1 ? 'entry' : 'entries'}`);
    return new ActionCache(raw, filePath);
  } catch {
    return new ActionCache(emptyData(), filePath);
  }
}

export async function loadActionCache(institution: string, task: string): Promise<ActionCache> {
  const slug = institution.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const filePath = path.join(DATA_DIR, 'page-cache', `${slug}-${task}.json`);
  return readCacheFile(filePath);
}

/** Create an empty cache backed by the given file path. Intended for tests. */
export function createActionCache(filePath: string): ActionCache {
  return new ActionCache(emptyData(), filePath);
}

/** Load a cache from an explicit file path. Intended for tests. */
export async function loadActionCacheFromFile(filePath: string): Promise<ActionCache> {
  return readCacheFile(filePath);
}
