import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createPageCache, loadPageCacheFromFile } from './cache';

describe('PageCache', () => {
  let tmpDir: string;
  let cacheFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openvault-cache-test-'));
    cacheFile = path.join(tmpDir, 'test.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null on cache miss', () => {
    const cache = createPageCache(cacheFile);
    expect(cache.check('- button "Log in"')).toBeNull();
  });

  it('returns recorded actions on cache hit', () => {
    const cache = createPageCache(cacheFile);
    const snap = '- button "Log in"';
    cache.record(snap, [{ name: 'click', input: { role: 'button', name: 'Log in' } }]);
    const hit = cache.check(snap);
    expect(hit).not.toBeNull();
    expect(hit).toHaveLength(1);
    expect(hit![0].name).toBe('click');
    expect(hit![0].input).toEqual({ role: 'button', name: 'Log in' });
  });

  it('stores and replays multiple actions per snapshot', () => {
    const cache = createPageCache(cacheFile);
    const snap = '- button "A"\n- button "B"';
    cache.record(snap, [
      { name: 'click', input: { role: 'button', name: 'A' } },
      { name: 'click', input: { role: 'button', name: 'B' } },
    ]);
    const hit = cache.check(snap);
    expect(hit).toHaveLength(2);
    expect(hit![0].input).toEqual({ role: 'button', name: 'A' });
    expect(hit![1].input).toEqual({ role: 'button', name: 'B' });
  });

  it('treats structurally equivalent snapshots as the same key', () => {
    const cache = createPageCache(cacheFile);
    const snap1 = '- text "Total equity"\n- text "$258,486.25"';
    const snap2 = '- text "Total equity"\n- text "$301,200.00"';
    cache.record(snap1, [{ name: 'click', input: { role: 'link', name: 'View accounts' } }]);
    expect(cache.check(snap2)).not.toBeNull();
  });

  it('returns null after failSnapshot', () => {
    const cache = createPageCache(cacheFile);
    const snap = '- button "Submit"';
    cache.record(snap, [{ name: 'click', input: { role: 'button', name: 'Submit' } }]);
    cache.failSnapshot(snap);
    expect(cache.check(snap)).toBeNull();
  });

  it('does not mark dirty when recording an unchanged entry', async () => {
    const cache = createPageCache(cacheFile);
    const snap = '- button "Log in"';
    cache.record(snap, [{ name: 'click', input: { role: 'button', name: 'Log in' } }]);
    await cache.flush();
    const mtime1 = (await fs.stat(cacheFile)).mtimeMs;

    cache.record(snap, [{ name: 'click', input: { role: 'button', name: 'Log in' } }]);
    await cache.flush();
    const mtime2 = (await fs.stat(cacheFile)).mtimeMs;

    expect(mtime2).toBe(mtime1);
  });

  it('treats key-order-different inputs as equal', () => {
    const cache = createPageCache(cacheFile);
    const snap = '- button "Log in"';
    cache.record(snap, [{ name: 'click', input: { name: 'Log in', role: 'button' } }]);
    const snapBefore = JSON.stringify((cache as unknown as { data: { steps: unknown } }).data.steps);
    cache.record(snap, [{ name: 'click', input: { role: 'button', name: 'Log in' } }]);
    const snapAfter = JSON.stringify((cache as unknown as { data: { steps: unknown } }).data.steps);
    expect(snapAfter).toBe(snapBefore);
  });

  it('persists entries to disk and loads them back', async () => {
    const cache = createPageCache(cacheFile);
    const snap = '- button "Log in"';
    cache.record(snap, [{ name: 'click', input: { role: 'button', name: 'Log in' } }]);
    await cache.flush();

    const loaded = await loadPageCacheFromFile(cacheFile);
    const hit = loaded.check(snap);
    expect(hit).not.toBeNull();
    expect(hit![0].name).toBe('click');
  });

  it('starts fresh when the cache file has a wrong version', async () => {
    await fs.writeFile(cacheFile, JSON.stringify({ version: 999, steps: {}, updatedAt: '' }));
    const cache = await loadPageCacheFromFile(cacheFile);
    expect(cache.check('- button "Log in"')).toBeNull();
  });

  it('starts fresh when the cache file is corrupt JSON', async () => {
    await fs.writeFile(cacheFile, 'not valid json');
    const cache = await loadPageCacheFromFile(cacheFile);
    expect(cache.check('- button "Log in"')).toBeNull();
  });

  it('starts fresh when steps is an array instead of an object', async () => {
    await fs.writeFile(cacheFile, JSON.stringify({ version: 1, steps: [], updatedAt: '' }));
    const cache = await loadPageCacheFromFile(cacheFile);
    expect(cache.check('- button "Log in"')).toBeNull();
  });
});
