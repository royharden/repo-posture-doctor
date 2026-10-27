import { describe, expect, it } from 'vitest';
import { findCandidates, safeExcerpt, spanAt, toSafe } from '../src/core/safe.ts';
import { sha256 } from '../src/core/sha256.ts';
import { createSnapshot, classifyPath } from '../src/core/snapshot.ts';
import { coverage } from '../src/core/scope.ts';
import { scan } from '../src/core/scan.ts';
import type { Rule } from '../src/core/types.ts';

// Builder unit fixtures only: no corpus content or evaluator input is authored here.
const body = Array.from({ length: 40 }, (_, i) => 'a9B2c8D4e7F5g6H3'[i % 16]).join('');
const key = ['sk', '-proj-'].join('') + body;

describe('pure output boundary (source-only, not yet run)', () => {
  it('preserves only public format prefixes and masks every known-value occurrence', () => {
    expect(toSafe(key)).toBe('sk-proj-…[redacted 40 chars]');
    expect(toSafe(`again ${body}`, [body])).not.toContain(body);
  });
  it('masks complete tokens before cutting a long-line excerpt', () => {
    const text = `${'z'.repeat(70)} ${key} ${'q'.repeat(70)} ${key}`;
    const excerpt = safeExcerpt(text, 100, 101);
    expect(excerpt).not.toContain(body.slice(0, 6));
    expect(excerpt).not.toContain(body.slice(-6));
  });
  it('uses literal-body offsets for quoted JSON keys', () => {
    const text = `{"DB_PASSWORD":"${body}"}`;
    const match = findCandidates(text).find(candidate => candidate.kind === 'assignment');
    expect(match?.start).toBe(text.indexOf(body));
    expect(match?.value).toBe(body);
  });
  it('never includes PEM material in its own finding excerpt or neighboring excerpt', () => {
    const marker = ['-----BEG', 'IN RSA PRIV', 'ATE KEY-----'].join('');
    const end = ['-----E', 'ND RSA PRIV', 'ATE KEY-----'].join('');
    const text = `{"private_key":"${marker}\\n${body}\\n${end}","flag":true}`;
    const start = text.indexOf(marker);
    expect(safeExcerpt(text, start, start + marker.length)).toBe(marker);
    expect(safeExcerpt(text, text.indexOf('flag'), text.indexOf('flag') + 4)).not.toContain(body.slice(0, 6));
    expect(toSafe(text)).not.toContain(body.slice(0, 6));
  });
  it('escapes controls in paths without emitting raw control bytes', () => {
    expect(toSafe('folder/unsafe\u0001.ts')).toBe('folder/unsafe\\u{1}.ts');
  });
  it('uses inclusive UTF-16 span coordinates', () => {
    expect(spanAt('😀x\r\nabc', 5, 8)).toEqual({ startLine: 2, startCol: 1, endLine: 2, endCol: 3 });
  });
  it('implements the published SHA-256 empty/abc vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('rebuilds excerpts with detections from other files before windowing', () => {
    const text = `${'q'.repeat(80)} ${body} ${'w'.repeat(80)}`;
    const snapshot = createSnapshot('demo', [
      { path: 'a.ts', size: 100, kind: 'source', content: `const DB_PASSWORD = "${body}";` },
      { path: 'b.ts', size: 250, kind: 'source', content: text },
    ]);
    const rule: Rule = { id: 'obs.empty_catch', evaluate: () => [{ rule_id: 'obs.empty_catch', family: 'obs', subject: 'b.ts:1:90-1:91', state: 'flagged', concern: true,
      severity_hint: 'medium', message: 'literal check', blind_spot: 'unit fixture', evidence: [{ kind: 'file:line', path: 'b.ts', line: 1, col: 90, endLine: 1, endCol: 91, excerpt: 'recomputed by scan' }] }] };
    const report = scan(snapshot, [rule]);
    expect(report.results[0].evidence[0].excerpt).not.toContain(body.slice(0, 6));
    expect(report.results[0].evidence[0].excerpt).not.toContain(body.slice(-6));
    expect(scan(snapshot, [rule])).toEqual(report);
    expect(JSON.stringify(report)).not.toMatch(/"(?:score|grade|badge)"\s*:/);
  });
});

describe('scope boundary (source-only, not yet run)', () => {
  it('excludes exact denied folder segments, while inventorying GitHub workflows', () => {
    const snapshot = createSnapshot('demo', [
      { path: 'Node_Modules/a.ts', size: 1, kind: 'source', content: 'x' },
      { path: '.github/workflows/test.yml', size: 1, kind: 'yaml', content: 'x' },
    ]);
    expect(snapshot.files.map(file => file.path)).toEqual(['.github/workflows/test.yml']);
    expect(snapshot.scope.content_complete).toBe(true);
    expect(snapshot.scope.skipped).toEqual([]);
  });
  it('does not carry non-template environment bodies into the snapshot', () => {
    const snapshot = createSnapshot('demo', [{ path: '.env.local', size: 8, kind: 'env', content: 'omitted' }]);
    expect(snapshot.files[0].content).toBeUndefined();
    expect(snapshot.files[0].metadata_only).toBe(true);
    expect(classifyPath('.envrc')).toBe('other');
  });
  it('marks inventory incompleteness in every path-scoped coverage query', () => {
    const snapshot = createSnapshot('demo', []); snapshot.scope.inventory_complete = false;
    expect(coverage(snapshot, () => true, ['source']).skipped).toEqual([{ reason: 'inventory_incomplete', count: 1 }]);
  });
});
