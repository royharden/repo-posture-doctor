import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve, relative, sep } from 'node:path';
import { walk } from '../src/cli/walk.ts';
import { createSnapshot } from '../src/core/snapshot.ts';
import { DEFAULT_CONFIG } from '../src/core/config.ts';
import { rules } from '../src/core/rules/index.ts';
import type { RepoSnapshot } from '../src/core/types.ts';

// Builder regression controls only; never corpus/evaluation inputs. Not run in Dirty Mode.
const disk = vi.hoisted(() => ({ lstat: vi.fn(), realpath: vi.fn(), readdir: vi.fn(), open: vi.fn() }));
vi.mock('node:fs/promises', () => disk);
const root = resolve('m1-review-control-root');
const pathRules = ['secrets.provider_key', 'secrets.env_file_present', 'rls.table_rls_not_enabled', 'rls.literal_true_write_policy'];
const relativePath = (path: string): string => relative(root, path).split(sep).join('/');
const stat = (directory: boolean, size = 0) => ({ size, isSymbolicLink: () => false, isDirectory: () => directory, isFile: () => !directory });
function evaluate(snapshot: RepoSnapshot, id: string) { return rules.find(rule => rule.id === id)!.evaluate(snapshot, DEFAULT_CONFIG); }
function expectInventoryUnknown(snapshot: RepoSnapshot): void {
  expect(snapshot.scope.inventory_complete).toBe(false);
  for (const id of pathRules) {
    const summary = evaluate(snapshot, id).find(result => result.subject === 'root');
    expect(summary?.state, id).toBe('unknown');
    expect(summary?.coverage?.skipped, id).toContainEqual({ reason: 'inventory_incomplete', count: 1 });
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  disk.realpath.mockImplementation(async (path: string) => path);
  disk.lstat.mockImplementation(async () => stat(true));
  disk.readdir.mockResolvedValue([]);
});

describe('M1 B1 lost-directory inventory regressions', () => {
  it('propagates uncertainty for a case-folded duplicate directory before lstat', async () => {
    // what_bug_this_catches: pruning foo/ must not certify absent secrets or migrations hidden below it.
    disk.readdir.mockImplementation(async (path: string) => path === root ? ['Foo', 'foo'] : []);
    const snapshot = await walk(root);
    expect(snapshot.scope.skipped_paths).toContainEqual({ path: 'foo', reason: 'case_duplicate' });
    expect(disk.lstat.mock.calls.some(([path]) => relativePath(path as string) === 'foo')).toBe(false);
    expectInventoryUnknown(snapshot);
  });

  it.each(['unknown-entry', 'unknown.ts'])('propagates unresolved entry-type failures for %s', async name => {
    // what_bug_this_catches: an lstat failure can hide descendants regardless of the entry extension.
    disk.readdir.mockResolvedValue([name]);
    disk.lstat.mockImplementation(async (path: string) => {
      if (path !== root) throw new Error('synthetic metadata failure');
      return stat(true);
    });
    const snapshot = await walk(root);
    expect(snapshot.scope.skipped_paths).toContainEqual({ path: name, reason: 'unreadable' });
    expectInventoryUnknown(snapshot);
  });

  it('keeps known regular-file read failure separate from inventory loss', async () => {
    // what_bug_this_catches: unavailable source contents must not imply unknown env-name metadata.
    disk.readdir.mockResolvedValue(['source.ts']);
    disk.lstat.mockImplementation(async (path: string) => stat(path === root, 4));
    disk.open.mockRejectedValue(new Error('synthetic content failure'));
    const snapshot = await walk(root);
    expect(snapshot.scope.inventory_complete).toBe(true);
    expect(snapshot.scope.content_complete).toBe(false);
    expect(snapshot.files).toContainEqual({ path: 'source.ts', size: 4, kind: 'source', skipped: 'unreadable' });
    expect(evaluate(snapshot, 'secrets.provider_key')[0]?.state).toBe('unknown');
    expect(evaluate(snapshot, 'secrets.env_file_present')[0]?.state).toBe('absent_in_scope');
  });
});

describe('M1 B2 env metadata coverage regressions', () => {
  it.each(['binary', 'file_bytes_cap', 'unreadable'])('ignores unrelated source content skip %s', reason => {
    // what_bug_this_catches: the env metadata rule must not depend on reading unrelated source contents.
    const snapshot = createSnapshot('fixture', [{ path: 'src/a.ts', size: 4, kind: 'source', skipped: reason }]);
    expect(snapshot.scope.inventory_complete).toBe(true);
    expect(evaluate(snapshot, 'secrets.env_file_present')[0]?.state).toBe('absent_in_scope');
  });

  it('retains env findings when unrelated source content is skipped', () => {
    const snapshot = createSnapshot('fixture', [
      { path: '.env.local', size: 4, kind: 'env', metadata_only: true },
      { path: 'src/a.ts', size: 4, kind: 'source', skipped: 'binary' },
    ]);
    expect(evaluate(snapshot, 'secrets.env_file_present').map(result => [result.subject, result.state])).toEqual([['.env.local', 'flagged']]);
  });

  it('retains unknown for missing env metadata', () => {
    // what_bug_this_catches: narrowing the predicate must not hide an actual in-scope env-path skip.
    const snapshot = createSnapshot('fixture', [{ path: '.env.local', size: 0, kind: 'env', skipped: 'unreadable' }]);
    const summary = evaluate(snapshot, 'secrets.env_file_present')[0];
    expect(summary?.state).toBe('unknown');
    expect(summary?.coverage?.skipped).toContainEqual({ reason: 'unreadable', count: 1 });
  });

  it('retains unknown when the file cap hides unlisted env paths', () => {
    // what_bug_this_catches: a complete subset of env metadata cannot certify a capped inventory.
    const snapshot = createSnapshot('fixture', []);
    snapshot.scope.inventory_complete = false;
    snapshot.scope.content_complete = false;
    snapshot.scope.skipped = [{ reason: 'file_cap', count: 1 }];
    expectInventoryUnknown(snapshot);
  });
});
