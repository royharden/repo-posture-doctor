import { describe, expect, it } from 'vitest';
import type { FileKind, RepoSnapshot, Rule, SnapshotFile } from '../src/core/types.ts';
import { emptyScope } from '../src/core/scope.ts';
import { noTestFilesRule } from '../src/core/rules/tests/noTestFiles.ts';
import { noTestScriptRule } from '../src/core/rules/tests/noTestScript.ts';
import { runnerNotInCiRule } from '../src/core/rules/tests/runnerNotInCi.ts';
import { emptyCatchRule } from '../src/core/rules/obs/emptyCatch.ts';
import { noLoggingLibraryRule } from '../src/core/rules/obs/noLoggingLibrary.ts';

function file(path: string, content: string, kind: FileKind = 'source'): SnapshotFile { return { path, content, kind, size: content.length }; }
function snapshot(files: SnapshotFile[], complete = true): RepoSnapshot {
  return { root_label: 'unit-fixture', files, scope: { ...emptyScope('unit-fixture'), files_seen: files.length,
    files_read: files.filter(item => item.content !== undefined && !item.skipped).length, inventory_complete: complete } };
}
const config = { entropy_threshold: 3.5, placeholders: [], provisional: true, to_be_chosen_on: 'dev' };
const run = (rule: Rule, files: SnapshotFile[], complete = true) => rule.evaluate(snapshot(files, complete), config);
const pkg = (scripts: Record<string, string> = { test: 'vitest run' }) => file('package.json', JSON.stringify({ scripts }), 'json');
const flow = (steps: string) => file('.github/workflows/ci.yml', `name: check\non: [push]\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`, 'yaml');

describe('M2 literal test rules (unit fixtures only, never corpus)', () => {
  it('recognizes e2e, nested __tests__ and spec.tsx paths', () => {
    for (const path of ['e2e/login.ts', 'src/__tests__/nested/check.js', 'src/button.spec.tsx']) expect(run(noTestFilesRule, [file(path, '')])[0].state).toBe('present');
    expect(run(noTestFilesRule, [file('src/app.ts', '')])[0].message).toContain('no test files found in 1 scanned paths');
    expect(run(noTestFilesRule, [], false)[0].state).toBe('unknown');
  });
  it('distinguishes missing, invalid, placeholder and delegated root scripts', () => {
    expect(run(noTestScriptRule, [])[0].state).toBe('unknown');
    expect(run(noTestScriptRule, [file('package.json', '{', 'json')])[0].reason).toBe('invalid_json');
    expect(run(noTestScriptRule, [pkg({ test: 'echo "Error: no test specified" && exit 1' })])[0].concern).toBe(true);
    expect(run(noTestScriptRule, [pkg({ 'test:unit': 'vitest' })])[0].concern).toBe(true);
    expect(run(noTestScriptRule, [pkg({ test: 'npm-run-all test:*' })])[0].state).toBe('present');
  });
  it('finds matrix and multiline test commands, including script delegation', () => {
    const workflow = flow('      - run: |\n          npm ci\n          npm test\n');
    expect(run(runnerNotInCiRule, [pkg(), workflow])[0].state).toBe('present');
    expect(run(runnerNotInCiRule, [pkg({ test: 'vitest', verify: 'npm test' }), flow('      - run: npm run verify\n')])[0].state).toBe('present');
    expect(run(runnerNotInCiRule, [pkg(), flow('      - run: npm run build\n')])[0].concern).toBe(true);
  });
  it('abstains for reusable, missing, invalid or unreadable workflows and capped inventory', () => {
    const reusable = file('.github/workflows/ci.yml', 'jobs:\n  shared:\n    uses: org/repo/.github/workflows/shared.yml@main\n', 'yaml');
    expect(run(runnerNotInCiRule, [pkg(), reusable])[0].reason).toBe('reusable_workflow');
    expect(run(runnerNotInCiRule, [pkg()])[0].state).toBe('unknown');
    expect(run(runnerNotInCiRule, [pkg(), file('.github/workflows/ci.yml', 'broken [', 'yaml')])[0].state).toBe('unknown');
    expect(run(runnerNotInCiRule, [pkg(), { path: '.github/workflows/ci.yml', size: 100, kind: 'yaml', skipped: 'unreadable' }])[0].state).toBe('unknown');
    expect(run(runnerNotInCiRule, [pkg(), flow('      - run: npm test\n')], false)[0].state).toBe('unknown');
  });
});

describe('M2 observability rules', () => {
  it('finds comment-only catches through syntax, excluding tests and string decoys', () => {
    const results = run(emptyCatchRule, [file('src/a.ts', 'try { work() } catch (error) { /* intentional */ }'),
      file('src/b.ts', 'const text = "catch {}"; try { work() } catch { throw new Error("fixed") }'),
      file('test/c.ts', 'try {} catch {}')]);
    expect(results.filter(item => item.concern)).toHaveLength(1);
    expect(results[0].evidence[0].path).toBe('src/a.ts');
  });
  it('does not overclaim absence when source is skipped or invalid', () => {
    expect(run(emptyCatchRule, [{ path: 'src/a.ts', size: 1, kind: 'source', skipped: 'binary' }])[0].state).toBe('unknown');
    expect(run(emptyCatchRule, [file('src/a.ts', 'function (')])[0].reason).toBe('parse_failure');
    expect(run(emptyCatchRule, [], false)[0].state).toBe('unknown');
  });
  it('recognizes listed dependency prefixes and local logger imported by two distinct files', () => {
    expect(run(noLoggingLibraryRule, [file('package.json', JSON.stringify({ dependencies: { '@sentry/node': '1' } }), 'json')])[0].state).toBe('present');
    const logger = file('src/lib/log.ts', 'export const log = () => {};');
    const imports = [logger, file('src/a.ts', 'import { log } from "./lib/log";'), file('src/b.ts', 'import { log } from "./lib/log.js";')];
    expect(run(noLoggingLibraryRule, imports)[0].state).toBe('present');
    expect(run(noLoggingLibraryRule, imports.slice(0, 2))[0].concern).toBe(true);
    expect(run(noLoggingLibraryRule, [file('package.json', 'broken', 'json')])[0].state).toBe('unknown');
    expect(run(noLoggingLibraryRule, imports, false)[0].state).toBe('unknown');
  });
});
