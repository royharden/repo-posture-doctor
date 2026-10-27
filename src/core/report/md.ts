import type { Report } from '../types.ts';
import { toSafe } from '../safe.ts';

/** Data is escaped as plain Markdown text; report paths are never links. */
export function markdownText(value: string, detectedValues: readonly string[] = []): string {
  return toSafe(value, detectedValues).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\').replace(/([`|*_\[\]{}])/g, '\\$1');
}
export function renderMarkdown(report: Report, detectedValues: readonly string[] = []): string {
  const text = (value: string) => markdownText(value, detectedValues);
  const lines = ['# Repo posture doctor', '', 'Static evidence in the scanned scope; absence of a finding is not proof of safety.', '',
    `Root: ${text(report.scope.root_label)}`, '',
    `Coverage: ${report.scope.files_seen} paths inventoried; ${report.scope.files_read} files read; ${report.scope.metadata_only} metadata-only.`,
    `Inventory complete: ${report.scope.inventory_complete}; content complete: ${report.scope.content_complete}.`, '',
    '| Rule | Subject | State | Concern | Evidence |', '|---|---|---|---|---|'];
  for (const result of report.results) {
    const evidence = result.evidence.map(pointer => `${text(pointer.path)}:${pointer.line}:${pointer.col} ${text(pointer.excerpt)}`).join('; ');
    lines.push(`| ${text(result.rule_id)} | ${text(result.subject)} | ${text(result.state)} | ${result.concern === null ? 'unknown' : String(result.concern)} | ${evidence} |`);
  }
  lines.push('', '## Interpretation', '');
  for (const result of report.results) {
    lines.push(`- ${text(result.rule_id)}: ${text(result.message)} Blind spot: ${text(result.blind_spot)}${result.reason ? ` Reason: ${text(result.reason)}.` : ''}`);
  }
  lines.push('', '## Coverage boundaries', '');
  for (const entry of report.scope.denied) lines.push(`- Denied ${text(entry.pattern)}: ${entry.count}.`);
  for (const entry of report.scope.skipped) lines.push(`- Skipped ${text(entry.reason)}: ${entry.count}.`);
  for (const entry of report.scope.skipped_paths) lines.push(`- Skipped path ${text(entry.path)}: ${text(entry.reason)}.`);
  lines.push('', '## Not checked', '');
  for (const entry of report.not_checked) lines.push(`- ${text(entry.item)}: ${text(entry.why)}`);
  return `${lines.join('\n')}\n`;
}
