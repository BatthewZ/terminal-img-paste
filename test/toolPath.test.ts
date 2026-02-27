import { describe, it, expect, beforeEach } from 'vitest';
import { resolveToolPath, resolveToolPathOrFallback, clearToolPathCache } from '../src/util/toolPath';

beforeEach(() => {
  clearToolPathCache();
});

describe('resolveToolPath', () => {
  it('returns an absolute path for a known tool (ls)', async () => {
    const result = await resolveToolPath('ls');
    expect(result).toBeDefined();
    expect(result!.startsWith('/')).toBe(true);
  });

  it('returns undefined for a nonexistent tool', async () => {
    const result = await resolveToolPath('nonexistent-tool-xyz-1234567890');
    expect(result).toBeUndefined();
  });

  it('caches resolved paths (second call does not re-invoke which)', async () => {
    const first = await resolveToolPath('ls');
    const second = await resolveToolPath('ls');
    expect(first).toBe(second);
  });

  it('returns different results for different tools', async () => {
    const ls = await resolveToolPath('ls');
    const cat = await resolveToolPath('cat');
    expect(ls).toBeDefined();
    expect(cat).toBeDefined();
    // They should be different paths
    expect(ls).not.toBe(cat);
  });
});

describe('resolveToolPathOrFallback', () => {
  it('returns absolute path for a known tool', async () => {
    const result = await resolveToolPathOrFallback('ls');
    expect(result.startsWith('/')).toBe(true);
  });

  it('returns the original name when tool is not found', async () => {
    const result = await resolveToolPathOrFallback('nonexistent-tool-xyz-1234567890');
    expect(result).toBe('nonexistent-tool-xyz-1234567890');
  });
});

describe('clearToolPathCache', () => {
  it('clears the cache so subsequent calls re-resolve', async () => {
    await resolveToolPath('ls');
    clearToolPathCache();
    // After clearing, the path should still resolve correctly
    const result = await resolveToolPath('ls');
    expect(result).toBeDefined();
    expect(result!.startsWith('/')).toBe(true);
  });
});
