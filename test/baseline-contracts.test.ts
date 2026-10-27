import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createSnapshot, classifyPath } from '../src/core/snapshot.ts';
import { runB0, runB0Oos } from '../baselines/b0-naive/index.ts';
import { auditSecrets } from '../baselines/b1-vca13/supabase/functions/_shared/auditors/secrets.ts';
import { auditAuth } from '../baselines/b1-vca13/supabase/functions/_shared/auditors/auth.ts';
import { selectCandidates, selectFiles } from '../baselines/b1-vca13/selection.ts';
import { runB1 } from '../baselines/b1-vca13/adapter.ts';
import { verifyB1 } from '../scripts/verify-b1.ts';
import { importGitleaks } from '../baselines/gitleaks/adapter.ts';
import type { FetchedFile } from '../baselines/b1-vca13/supabase/functions/_shared/fetch-target.ts';

// Unit-only fixtures; never a corpus recipe, label or measured example.
const originalFile = (path: string, text: string, kind = 'source'): FetchedFile => ({ path, text, kind, size: text.length, status: 200, headers: {} });
const snapshot = (path: string, content: string) => createSnapshot('unit', [{ path, content, size: content.length, kind: classifyPath(path) }]);
const hash = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('B0 frozen naive behavior (source only)', () => {
  it('has all twelve rule IDs and preserves the substring/placeholder defects', () => {
    const output = runB0(snapshot('src/a.ts', 'task-management-dashboard-widget ' + ['sk', '-'].join('') + 'x'.repeat(30)));
    expect(new Set(output.map(item => item.rule_id)).size).toBe(12);
    expect(output.some(item => item.rule_id === 'secrets.provider_key' && item.concern)).toBe(true);
  });
  it('keeps env templates as naive positives and the OOS keyword floor separate', () => {
    expect(runB0(snapshot('.env.example', 'SAFE=value')).some(item => item.rule_id === 'secrets.env_file_present' && item.concern)).toBe(true);
    const result = runB0Oos(snapshot('src/a.ts', 'const secret = "unit-generic-value";'));
    expect(result.some(item => item.rule_id === 'secrets.oos_keyword' && item.concern)).toBe(true);
    expect(runB0(snapshot('src/a.ts', 'const secret = "unit-generic-value";')).some(item => item.rule_id === 'secrets.oos_keyword')).toBe(false);
  });
});

describe('B1 original behavior and exact input selection', () => {
  it('pins original files and selection excerpts (later normal-mode check)', async () => { await expect(verifyB1()).resolves.toBeUndefined(); });
  it('preserves original substring and env-template positives', () => {
    const output = auditSecrets([originalFile('src/a.ts', 'task-management-dashboard-widget'), originalFile('.env.example', 'SAFE=value', 'env')], 'repo');
    expect(output.some(item => item.rule_id === 'openai_key')).toBe(true);
    expect(output.some(item => item.rule_id === 'committed_env_file')).toBe(true);
  });
  it('preserves stateful assignment duplicate behavior', () => {
    const first = ['sk', '-'].join('') + 'abcdefghijklmnopqrstuvwxyz0123456789ABCD';
    const second = ['sk', '-'].join('') + 'zyxwvutsrqponmlkjihgfedcba9876543210ZYXW';
    const findings = auditSecrets([originalFile('src/a.ts', `const API_KEY = "${first}";\nconst SECRET_KEY = "${second}";`)], 'repo');
    expect(findings.filter(item => item.rule_id === 'openai_key')).toHaveLength(2);
    expect(findings.some(item => item.rule_id === 'high_entropy_secret')).toBe(true);
  });
  it('preserves wrong-neighbour and log/blog RLS defects', () => {
    const first = auditAuth([originalFile('supabase/migrations/a.sql', 'create table public.orders (id uuid); alter table public.orders enable row level security; create table public.payments (id uuid);', 'migration')], 'repo');
    expect(first.some(item => item.rule_id === 'rls_missing' && item.evidence.includes('payments'))).toBe(false);
    const second = auditAuth([originalFile('supabase/migrations/a.sql', 'create table public.log (id int); create table public.blog (id int); alter table public.blog enable row level security;', 'migration')], 'repo');
    expect(second.some(item => item.rule_id === 'rls_missing' && item.evidence.includes('log'))).toBe(false);
  });
  it('uses only original selected kinds and respects the original sixty-file slice', () => {
    const files = ['README.md', '.github/workflows/test.yml', 'config.json', 'src/a.ts', '.env.example', 'package.json'].map(path => ({ path, size: 10, type: 'blob' }));
    expect(selectCandidates({ tree: files }).map(file => file.path)).toEqual(['src/a.ts', '.env.example', 'package.json']);
    expect(selectCandidates({ tree: Array.from({ length: 70 }, (_, index) => ({ path: `src/${index}.ts`, size: 10, type: 'blob' })) })).toHaveLength(60);
    expect(selectCandidates({ tree: [{ path: 'src/huge.ts', size: 2 * 1024 * 1024, type: 'blob' }] })).toHaveLength(0);
  });
  it('applies original per-file characters and total budget without fixing the before arm', async () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({ path: `src/${index}.ts`, type: 'blob', size: 1_572_864 }));
    const output = await selectFiles(entries, async () => 'z'.repeat(1_572_865));
    expect(output[0]?.text?.length).toBe(1_572_864); expect(output[4]?.text).toBeUndefined(); expect(output[4]?.error).toBe('Size limit exceeded');
  });
  it('refuses paths outside synthetic materialization before opening anything', async () => {
    await expect(runB1('C:/live-repository')).rejects.toThrow('b1_input_outside_materialized_corpus');
  });
});

describe('gitleaks receipt states', () => {
  const pins = { version: 'unit-version', binary_sha256: 'a'.repeat(64), default_config_sha256: 'b'.repeat(64), corpus_sha256: 'c'.repeat(64), mapping_sha256: '' };
  function capture() {
    const mappingText = JSON.stringify({ schema_version: 1, status: 'frozen', release: pins.version, default_config_sha256: pins.default_config_sha256, rules: { 'generic-api-key': 'secrets.secret_assignment' }, partial_maps: ['secrets.secret_assignment'] });
    const rawReportText = JSON.stringify([{ RuleID: 'generic-api-key', File: 'src/a.ts', StartLine: 2, EndLine: 2, Secret: 'REDACTED', Match: 'discard this source line' }]);
    const sanitized = JSON.stringify([{ rule_id: 'generic-api-key', path: 'src/a.ts', line: 2, end_line: 2 }]) + '\n';
    const expected = { ...pins, mapping_sha256: hash(mappingText) };
    const receipt = { schema_version: 1, ...expected, argv: ['gitleaks', 'dir', 'tmp-case', '--report-format', 'json', '--report-path', 'raw-report', '--redact=100', '--no-banner'], cwd: 'temp-clean-copy', platform: 'unit', exit_status: 1, raw_report_sha256: hash(rawReportText), sanitized_report_sha256: hash(sanitized), redaction: '100', isolated_config: true, command_verified: true };
    return { expected, receipt, rawReportText, mappingText };
  }
  it('reports missing receipt as not measured and mismatches as invalid, never a zero', () => {
    expect(importGitleaks(null, '[]', '{}', pins).status).toBe('not yet measured');
    const example = capture();
    expect(importGitleaks({ ...example.receipt, raw_report_sha256: 'd'.repeat(64) }, example.rawReportText, example.mappingText, example.expected).status).toBe('invalid measurement');
  });
  it('projects only safe metadata after all receipt checks', () => {
    const example = capture(); const result = importGitleaks(example.receipt, example.rawReportText, example.mappingText, example.expected);
    expect(result.status).toBe('measured'); expect(JSON.stringify(result)).not.toContain('discard this source line');
    expect(JSON.stringify(result)).not.toContain('REDACTED');
  });
});
