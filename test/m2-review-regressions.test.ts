import { describe, expect, it } from 'vitest';
import { parseWorkflow } from '../src/core/rules/tests/workflow.ts';
import { runnerNotInCiRule } from '../src/core/rules/tests/runnerNotInCi.ts';
import { emptyCatchRule } from '../src/core/rules/obs/emptyCatch.ts';
import { DEFAULT_CONFIG } from '../src/core/config.ts';
import { classifyPath, createSnapshot } from '../src/core/snapshot.ts';
import { scan } from '../src/core/scan.ts';
import { toSafe } from '../src/core/safe.ts';
import { inspectLeaks } from '../src/core/leakGuard.ts';
import type { SnapshotFile } from '../src/core/types.ts';

// Builder regression controls only; never corpus/evaluation inputs. Not run in Dirty Mode.
function file(path: string, content: string): SnapshotFile { return { path, content, size: content.length, kind: classifyPath(path) }; }
function ciResult(text: string) {
  return runnerNotInCiRule.evaluate(createSnapshot('fixture', [
    file('package.json', JSON.stringify({ scripts: { test: 'vitest run' } })),
    file('.github/workflows/ci.yml', text),
  ]), DEFAULT_CONFIG)[0];
}
const workflow = (fields: string): string => `jobs:\n  check:\n    runs-on: ubuntu-latest\n${fields}`;

describe('M2 workflow structural context regressions', () => {
  it('does not interpret a sibling job env.run as a step command', () => {
    // what_bug_this_catches: stale steps context made an environment-variable name count as test execution.
    const text = workflow('    steps:\n      - uses: actions/checkout@v4\n    env:\n      run: npm test\n');
    expect(parseWorkflow(text)).toEqual({ runs: [], reusable: false });
    expect(ciResult(text)?.state).toBe('absent_in_scope');
  });

  it('distinguishes nested step env.run from a direct step run', () => {
    const envOnly = workflow('    steps:\n      - uses: actions/checkout@v4\n        env:\n          run: npm test\n');
    expect(ciResult(envOnly)?.state).toBe('absent_in_scope');
    const actualRun = workflow('    steps:\n      - name: check\n        env:\n          run: npm run build\n        run: npm test\n');
    expect(parseWorkflow(actualRun)?.runs).toEqual(['npm test']);
    expect(ciResult(actualRun)?.state).toBe('present');
  });

  it.each([
    'jobs: {check: {steps: [{run: npm test}]}}',
    'jobs:\n  check: {steps: [{run: npm test}]}',
    'jobs:\n  check:\n    steps: [{run: npm test}]',
    'jobs:\n  check:\n    steps:\n      - {run: npm test}',
  ])('abstains on unsupported flow control structures: %s', text => {
    // what_bug_this_catches: unparsed jobs/steps flow collections must not produce a false absence claim.
    expect(parseWorkflow(text)).toBeNull();
    expect(ciResult(text)?.state).toBe('unknown');
    expect(ciResult(text)?.reason).toBe('invalid_or_unreadable_workflow');
  });

  it('detects reusable calls only at job-field scope', () => {
    const jobCall = 'jobs:\n  shared:\n    uses: org/repo/.github/workflows/shared.yml@main\n';
    expect(ciResult(jobCall)?.reason).toBe('reusable_workflow');
    const stepCall = workflow('    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n');
    expect(ciResult(stepCall)?.state).toBe('present');
    const nestedUses = workflow('    env:\n      uses: ordinary-data\n    steps:\n      - run: npm run build\n');
    expect(parseWorkflow(nestedUses)?.reusable).toBe(false);
    expect(ciResult(nestedUses)?.state).toBe('absent_in_scope');
  });

  it('retains block run commands and matrix values across sibling jobs and trailing root fields', () => {
    const text = 'jobs:\n  first:\n    strategy:\n      matrix:\n        node: [20, 22]\n    steps:\n      - run: |\n          npm ci\n          npm test\n  second:\n    steps:\n      - run: npm run build\nenv:\n  run: ordinary-data\n';
    expect(parseWorkflow(text)?.runs).toEqual(['npm ci\nnpm test', 'npm run build']);
    expect(ciResult(text)?.state).toBe('present');
  });
});

describe('M2 empty catch assembly regressions', () => {
  it('keeps raw internal pointer paths while masking subjects and final cross-file excerpts', () => {
    // what_bug_this_catches: a masked pointer blocked lookup, exposing a repeated detected body at a window edge.
    const alphabet = 'q7Zm2Pv9Na4Rx6Kc3Tj8Ws5Hy1Bd0Lf';
    const body = Array.from({ length: 64 }, (_, index) => alphabet[index * 11 % alphabet.length]).join('');
    const path = 'src/' + ['sk', '-proj-'].join('') + body + '.ts';
    const snapshot = createSnapshot('fixture', [
      file('src/assignment.ts', `const apiKey = "${body}";`),
      file(path, `'${body}'; try {} catch {}`),
    ]);
    const draft = emptyCatchRule.evaluate(snapshot, DEFAULT_CONFIG).find(result => result.state === 'flagged')!;
    expect(draft.evidence[0]?.path).toBe(path);
    expect(draft.subject).toContain(toSafe(path));
    expect(draft.subject).not.toContain(body);
    const report = scan(snapshot, [emptyCatchRule]);
    const finding = report.results.find(result => result.state === 'flagged')!;
    expect(finding.evidence[0]?.path).toBe(toSafe(path));
    expect(finding.evidence[0]?.excerpt).toContain('[redacted');
    expect(inspectLeaks([JSON.stringify(report)], [body])).toEqual([]);
  });

  it('hands each parse failure to the scanner without exposing internal paths in reports', () => {
    // what_bug_this_catches: aggregate unknown alone cannot support the matcher path-abstention contract.
    const paths = ['src/invalid-a.ts', 'src/invalid-b.ts'];
    const snapshot = createSnapshot('fixture', paths.map(path => file(path, 'function (')));
    const summary = emptyCatchRule.evaluate(snapshot, DEFAULT_CONFIG).find(result => result.subject === 'root')!;
    expect(summary.unknown_paths).toEqual(paths);
    expect(summary.coverage?.skipped).toContainEqual({ reason: 'parse_failure', count: 2 });
    const report = scan(snapshot, [emptyCatchRule]);
    for (const path of paths) expect(report.scope.skipped_paths).toContainEqual({ path, reason: 'parse_failure' });
    expect(report.scope.content_complete).toBe(false);
    expect(JSON.stringify(report)).not.toContain('unknown_paths');
  });
});
