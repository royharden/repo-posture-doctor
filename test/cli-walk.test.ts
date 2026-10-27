import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walk, validateOutput } from '../src/cli/walk.ts';
import { main } from '../src/cli/main.ts';

// Source-only builder controls; never corpus or evaluation input. Not run in Dirty Mode.
describe('CLI fixed scope and refusal boundary', () => {
  it('does not descend denied folders; github is inventoried and bundles are scanned', async () => {
    const root = await mkdtemp(join(tmpdir(), 'posture-control-'));
    await mkdir(join(root, 'Node_Modules')); await writeFile(join(root, 'Node_Modules', 'ignored.ts'), 'ignored');
    await mkdir(join(root, '.github')); await writeFile(join(root, '.github', 'ci.yml'), 'name: check');
    await mkdir(join(root, 'dist')); await writeFile(join(root, 'dist', 'bundle.js'), 'const a = 1;');
    const snapshot = await walk(root);
    expect(snapshot.files.map(f=>f.path)).toEqual(['.github/ci.yml', 'dist/bundle.js']);
    expect(snapshot.scope.denied).toContainEqual({ pattern: 'node_modules', count: 1 });
    expect(snapshot.scope.content_complete).toBe(true);
  });
  it('refuses existing and inside-root output; keeps non-template env bodies metadata only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'posture-control-'));
    await writeFile(join(root, '.env'), 'synthetic metadata control only');
    const snapshot = await walk(root);
    expect(snapshot.files[0]?.content).toBeUndefined();
    expect(snapshot.files[0]?.metadata_only).toBe(true);
    await expect(validateOutput(root, join(root, 'out'))).rejects.toThrow();
    await expect(validateOutput(root, root)).rejects.toThrow();
  });
  it('skips binary and symlink entries and returns incomplete coverage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'posture-control-'));
    await writeFile(join(root, 'binary.ts'), Buffer.from([65,0,66]));
    const snapshot = await walk(root);
    expect(snapshot.scope.skipped_paths).toContainEqual({ path: 'binary.ts', reason: 'binary' });
    expect(snapshot.scope.content_complete).toBe(false);
    expect(await main(['scan', root])).toBe(3);
  });
  it('refuses missing roots and unsupported arguments without quoting input', async () => {
    expect(await main(['bad-command'])).toBe(2);
    expect(await main(['scan', join(tmpdir(),'posture-absent-root-control')])).toBe(2);
  });
  it('writes into a fresh output, never overwriting existing files', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'posture-output-control-'));
    const root = join(parent,'input'); await mkdir(root); await writeFile(join(root,'index.ts'),'const a = 1;');
    const out = join(parent,'report');
    expect(await main(['scan',root,'--out',out])).toBe(0);
    expect(JSON.parse(await readFile(join(out,'report.json'),'utf8')).schema_version).toBe(1);
    expect(await main(['scan',root,'--out',out])).toBe(2);
  });
  it.skipIf(process.platform === 'win32')('rejects redirected roots and counts entry symlinks', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'posture-link-control-'));
    const root = join(parent,'root'); await mkdir(root); await writeFile(join(root,'index.ts'),'const a = 1;');
    await symlink(root,join(parent,'alias'));
    await expect(walk(join(parent,'alias'))).rejects.toThrow();
    await symlink(join(root,'index.ts'),join(root,'linked.ts'));
    expect((await walk(root)).scope.skipped_paths).toContainEqual({ path:'linked.ts',reason:'symlink' });
  });
});
