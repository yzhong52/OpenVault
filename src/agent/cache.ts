import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DATA_DIR } from '../db';

const CACHE_VERSION = 1;
const VERBOSE = process.env.VERBOSE === '1' || process.env.DEBUG === '1';

export interface CachedAction {
  name: string;
  input: Record<string, unknown>;
}

interface CacheData {
  version: number;
  steps: Record<string, CachedAction>;
  updatedAt: string;
}

// Strip dynamic values that change between runs but don't affect page structure.
// Order matters: more specific patterns first.
const NORMALIZE_RULES: Array<[RegExp, string]> = [
  // Dollar amounts  e.g. "$1,234.56"
  [/\$[\d,]+(?:\.\d+)?/g, '$_'],
  // Masked account numbers  e.g. "****1234", "XXXX-1234"
  [/[Xx*]{2,}[\s-]?\d+/g, 'ACCT'],
  // Large comma-separated numbers  e.g. "1,234,567.89"
  [/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, '_NUM_'],
  // Decimal numbers with exactly 2 places (financial amounts)
  [/\b\d+\.\d{2}\b/g, '_NUM_'],
  // Percentages  e.g. "3.5%"
  [/\b\d+(?:\.\d+)?%/g, '_%'],
  // ISO dates  e.g. "2024-01-15"
  [/\d{4}-\d{2}-\d{2}/g, '_DATE_'],
  // Month Day, Year  e.g. "January 15, 2024" or "Jan 15 2024"
  [/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\b\.?\s+\d{1,2},?\s+\d{4}/gi, '_DATE_'],
  // Numeric dates  e.g. "01/15/2024"
  [/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '_DATE_'],
  // Times  e.g. "3:45 PM", "15:30:00"
  [/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\b/gi, '_TIME_'],
];

// Tool inputs containing these field names hold credential values — don't cache them.
const SENSITIVE_FIELD_RE = /password|passcode|pin|secret|cvv|ssn/i;

// Tools whose inputs embed live session data that must not be cached verbatim.
const NON_CACHEABLE_TOOLS = new Set(['report_accounts']);

export function normalizeSnapshot(snapshot: string): string {
  let s = snapshot;
  for (const [re, sub] of NORMALIZE_RULES) s = s.replace(re, sub);
  return s.replace(/\s+/g, ' ').trim();
}

function fp(snapshot: string): string {
  return crypto.createHash('sha256').update(normalizeSnapshot(snapshot)).digest('hex').slice(0, 16);
}

function isCacheable(name: string, input: Record<string, unknown>): boolean {
  if (NON_CACHEABLE_TOOLS.has(name)) return false;
  if ((name === 'fill' || name === 'type') && SENSITIVE_FIELD_RE.test(String(input.name ?? ''))) return false;
  return true;
}

export class PageCache {
  private data: CacheData;
  private filePath: string;
  private dirty = false;
  // Fingerprints that produced a failed replay this run — don't retry them.
  private failedFps = new Set<string>();

  constructor(data: CacheData, filePath: string) {
    this.data = data;
    this.filePath = filePath;
  }

  check(snapshot: string): CachedAction | null {
    const h = fp(snapshot);
    if (this.failedFps.has(h)) return null;
    return this.data.steps[h] ?? null;
  }

  record(snapshot: string, name: string, input: Record<string, unknown>): void {
    if (!isCacheable(name, input)) return;
    const h = fp(snapshot);
    this.data.steps[h] = { name, input };
    this.data.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  // Mark a snapshot's cached action as bad for this run (replay failed).
  failSnapshot(snapshot: string): void {
    this.failedFps.add(fp(snapshot));
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
    this.dirty = false;
    if (VERBOSE) console.log(`💾 Page cache saved (${Object.keys(this.data.steps).length} entries)`);
  }
}

export async function loadPageCache(institution: string, task: string): Promise<PageCache> {
  const slug = institution.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const filePath = path.join(DATA_DIR, 'page-cache', `${slug}-${task}.json`);

  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf-8')) as CacheData;
    if (raw.version !== CACHE_VERSION || typeof raw.steps !== 'object') {
      // Stale or corrupt — start fresh.
      return new PageCache({ version: CACHE_VERSION, steps: {}, updatedAt: new Date().toISOString() }, filePath);
    }
    const count = Object.keys(raw.steps).length;
    if (VERBOSE) console.log(`📂 Loaded page cache: ${count} entr${count === 1 ? 'y' : 'ies'}`);
    return new PageCache(raw, filePath);
  } catch {
    return new PageCache({ version: CACHE_VERSION, steps: {}, updatedAt: new Date().toISOString() }, filePath);
  }
}
