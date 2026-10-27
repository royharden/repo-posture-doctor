import { createHash } from 'node:crypto';
import type { RuleResult } from '../../src/core/types.ts';
import { toSafe } from '../../src/core/safe.ts';
import { assertNoLeaks } from '../../src/core/leakGuard.ts';

export interface CapturePins { version: string; binary_sha256: string; default_config_sha256: string; corpus_sha256: string; mapping_sha256: string }
export interface SafeGitleaksFinding { rule_id: string; path: string; line: number; end_line: number }
export type GitleaksOutput = { status: 'not yet measured' | 'invalid measurement'; reason: string } |
  { status: 'measured'; findings: SafeGitleaksFinding[]; results: RuleResult[]; unmapped: number; partial_maps: string[] };
const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const permittedRules = ['secrets.provider_key', 'secrets.secret_assignment', 'secrets.service_role_jwt'];
const keys = ['schema_version', 'version', 'binary_sha256', 'default_config_sha256', 'argv', 'cwd', 'platform', 'exit_status', 'corpus_sha256', 'mapping_sha256', 'raw_report_sha256', 'sanitized_report_sha256', 'redaction', 'isolated_config', 'command_verified'];

/** Import only: this function never launches gitleaks and never treats an absent receipt as zero findings. */
export function importGitleaks(receipt: unknown, rawReportText: string, mappingText: string, pins: CapturePins,
  plantedValues: readonly string[] = []): GitleaksOutput {
  if (receipt === null || receipt === undefined) return { status: 'not yet measured', reason: 'receipt_missing' };
  const invalid = (reason: string): GitleaksOutput => ({ status: 'invalid measurement', reason });
  if (!record(receipt) || Object.keys(receipt).length !== keys.length || keys.some(key => !(key in receipt)) || Object.keys(receipt).some(key => !keys.includes(key))) return invalid('receipt_schema');
  if (receipt.schema_version !== 1 || typeof receipt.version !== 'string' || !receipt.version || receipt.version.length > 128 ||
    typeof receipt.cwd !== 'string' || !receipt.cwd || receipt.cwd.length > 2048 || typeof receipt.platform !== 'string' || !receipt.platform || receipt.platform.length > 128 ||
    ![0, 1].includes(receipt.exit_status as number) || receipt.redaction !== '100' || receipt.isolated_config !== true || receipt.command_verified !== true) return invalid('receipt_schema');
  for (const field of ['binary_sha256', 'default_config_sha256', 'corpus_sha256', 'mapping_sha256', 'raw_report_sha256', 'sanitized_report_sha256']) if (!sha(receipt[field])) return invalid('receipt_hash_schema');
  if (receipt.version !== pins.version || receipt.binary_sha256 !== pins.binary_sha256 || receipt.default_config_sha256 !== pins.default_config_sha256 || receipt.corpus_sha256 !== pins.corpus_sha256 || receipt.mapping_sha256 !== pins.mapping_sha256) return invalid('capture_pin_mismatch');
  const argv = receipt.argv;
  if (!Array.isArray(argv) || argv.length !== 9 || argv.some(item => typeof item !== 'string' || !item || item.length > 2048) ||
    argv[1] !== 'dir' || argv[3] !== '--report-format' || argv[4] !== 'json' || argv[5] !== '--report-path' || argv[7] !== '--redact=100' || argv[8] !== '--no-banner') return invalid('capture_argv');
  if (hash(rawReportText) !== receipt.raw_report_sha256 || hash(mappingText) !== receipt.mapping_sha256) return invalid('artifact_hash_mismatch');
  let mapping: unknown; let raw: unknown;
  try { mapping = JSON.parse(mappingText); raw = JSON.parse(rawReportText); } catch { return invalid('capture_json'); }
  if (!record(mapping) || mapping.schema_version !== 1 || mapping.status !== 'frozen' || mapping.release !== pins.version || mapping.default_config_sha256 !== pins.default_config_sha256 || !record(mapping.rules) ||
    Object.entries(mapping.rules).some(([source, target]) => !source || typeof target !== 'string' || !permittedRules.includes(target)) ||
    !Array.isArray(mapping.partial_maps) || mapping.partial_maps.some(value => typeof value !== 'string' || !permittedRules.includes(value))) return invalid('mapping_schema_or_unfrozen');
  if (!Array.isArray(raw) || raw.length > 100_000) return invalid('report_schema');
  if ((raw.length === 0 && receipt.exit_status !== 0) || (raw.length > 0 && receipt.exit_status !== 1)) return invalid('exit_status_findings_mismatch');
  const findings: SafeGitleaksFinding[] = [];
  const detected: string[] = [];
  for (const item of raw) {
    if (!record(item) || typeof item.RuleID !== 'string' || item.RuleID.length > 256 || typeof item.File !== 'string' || item.File.length > 2048 || !Number.isInteger(item.StartLine) || (item.StartLine as number) < 1 || !Number.isInteger(item.EndLine) || (item.EndLine as number) < (item.StartLine as number)) return invalid('finding_schema');
    const path = item.File.replace(/\\/g, '/');
    if (/^(?:\/|[A-Za-z]:)/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) return invalid('finding_path');
    if (typeof item.Secret === 'string' && item.Secret.length >= 6 && !/redacted/i.test(item.Secret)) detected.push(item.Secret);
    findings.push({ rule_id: item.RuleID, path, line: item.StartLine as number, end_line: item.EndLine as number });
  }
  const safeFindings = findings.map(item => ({ ...item, rule_id: toSafe(item.rule_id, [...detected, ...plantedValues]), path: toSafe(item.path, [...detected, ...plantedValues]) }));
  const sanitized = JSON.stringify(safeFindings) + '\n';
  if (hash(sanitized) !== receipt.sanitized_report_sha256) return invalid('sanitized_hash_mismatch');
  const results: RuleResult[] = []; let unmapped = 0; const counts = new Map<string, number>();
  for (const item of safeFindings) {
    const rule = mapping.rules[item.rule_id]; if (typeof rule !== 'string') { unmapped++; continue; }
    const subject = `${item.path}:${item.line}:1-${item.end_line}:1`; const key = `${rule}|${subject}`;
    const count = (counts.get(key) ?? 0) + 1; counts.set(key, count);
    results.push({ rule_id: rule, family: 'secrets', subject, state: 'flagged', concern: true, severity_hint: 'info',
      evidence: [{ kind: 'file:line', path: item.path, line: item.line, col: 1, endLine: item.end_line, endCol: 1, excerpt: '' }],
      message: 'sanitized gitleaks finding (source text and secret removed)', blind_spot: 'mapping-specific comparator; secret_assignment and JWT maps may be partial', id: hash(key + (count === 1 ? '' : `|#${count}`)) });
  }
  const output: GitleaksOutput = { status: 'measured', findings: safeFindings, results, unmapped, partial_maps: mapping.partial_maps as string[] };
  try { assertNoLeaks([JSON.stringify(output)], plantedValues, detected); } catch { return invalid('leak_guard_failure'); }
  return output;
}
