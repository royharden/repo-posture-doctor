import { describe, expect, it } from 'vitest';
import type { Report } from '../src/core/types.ts';
import { emptyScope } from '../src/core/scope.ts';
import { NOT_CHECKED } from '../src/core/notChecked.ts';
import { assertNoLeaks, guardedBodies, inspectLeaks } from '../src/core/leakGuard.ts';
import { markdownText, renderMarkdown } from '../src/core/report/md.ts';
import { toSafe } from '../src/core/safe.ts';

const body = Array.from({ length: 35 }, (_, i) => 'aQ7dF2mN9rT4vX6zB8cE1gH3jK5pS0uW'[i % 33]).join('');
const key = ['sk', '_li', 've_'].join('') + body;
const pem = ['-----BEG', 'IN RSA PRIV', 'ATE KEY-----'].join('');
const pemEnd = ['-----E', 'ND RSA PRIV', 'ATE KEY-----'].join('');

describe('M2 outbound boundary and guarded sinks', () => {
  it('uses six-character body windows and reports no secret text', () => {
    expect(inspectLeaks([`oops ${body.slice(5, 11)}`], [key])).toEqual([{ output_index: 0, guarded_value_index: 0 }]);
    expect(() => assertNoLeaks([body], [key])).toThrow('leak_guard_failure');
    expect(inspectLeaks([toSafe(key)], [key])).toEqual([]);
    expect(guardedBodies([], [])).toEqual([]); // unfiltered placeholder candidates never populate G(b)
  });
  it('normalizes escaped single-line PEM material without guarding public markers', () => {
    for (const separator of ['\n', '\\n', '\\\\n', '\\r\\n']) {
      const value = pem + separator + body + separator + pemEnd;
      expect(guardedBodies([value], [])).toEqual([body]);
      expect(inspectLeaks([pem], [value])).toEqual([]);
      expect(inspectLeaks([body.slice(2, 8)], [value])).toHaveLength(1);
    }
  });
  it('escapes Markdown pipes, backticks, HTML and control characters', () => {
    const escaped = markdownText('a|`<img>\u0001');
    expect(escaped).toContain('\\|'); expect(escaped).toContain('\\`');
    expect(escaped).toContain('&lt;img&gt;'); expect(escaped).not.toContain('\u0001');
  });
  it('guards report text, paths and errors while preserving not-checked wording', () => {
    const report: Report = { schema_version: 1, tool_version: 'unit', rules_version: 'v1.0-draft',
      scope: { ...emptyScope(key), skipped_paths: [{ path: `${key}.ts`, reason: 'unreadable' }] },
      results: [{ id: 'unit', rule_id: 'obs.empty_catch', family: 'obs', subject: 'root', state: 'unknown', concern: null,
        severity_hint: 'info', evidence: [], message: `fixed ${key}`, blind_spot: 'Literal evidence only.', reason: 'unreadable' }],
      not_checked: NOT_CHECKED.map(item => ({ ...item })) };
    const output = renderMarkdown(report, [key]);
    expect(output).toContain('absence of a finding is not proof of safety');
    expect(output).toContain('Injection surface');
    expect(inspectLeaks([output], [key])).toEqual([]);
    expect(output).not.toMatch(/\b(?:score|grade|badge)\s*:/i);
  });
});
