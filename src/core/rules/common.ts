import type { Family, RepoSnapshot, RuleDraft, SnapshotFile } from '../types.ts';
import { safeExcerpt, spanAt, toSafe } from '../safe.ts';
import { coverage, normalizePath } from '../scope.ts';

export function draft(rule_id: string, blind_spot: string, message: string, state: RuleDraft['state'] = 'flagged'): RuleDraft {
  return { rule_id, family: rule_id.split('.')[0] as Family, subject: 'root', state,
    concern: state === 'unknown' ? null : state === 'flagged', severity_hint: 'medium', evidence: [], message, blind_spot };
}
export function finding(rule_id: string, blind: string, message: string, file: SnapshotFile, start: number, end: number): RuleDraft {
  const text = file.content ?? ''; const span = spanAt(text, start, end); const path = toSafe(normalizePath(file.path));
  const result = draft(rule_id, blind, message);
  result.subject = `${path}:${span.startLine}:${span.startCol}-${span.endLine}:${span.endCol}`;
  // Raw internal path lets scan rebuild excerpts with the global detection set before its outbound boundary.
  result.evidence = [{ kind: 'file:line', path: normalizePath(file.path), line: span.startLine, col: span.startCol,
    endLine: span.endLine, endCol: span.endCol, excerpt: safeExcerpt(text, start, end) }];
  return result;
}
export function summarize(snapshot: RepoSnapshot, results: RuleDraft[], rule_id: string, blind: string,
  predicate: (file: SnapshotFile) => boolean, required: string[], reason = 'scope_incomplete'): RuleDraft[] {
  const scope = coverage(snapshot, predicate, required);
  if (scope.skipped.length || !results.length) {
    const result = draft(rule_id, blind, scope.skipped.length ? 'required scope was not completely examined' : 'no matching evidence in the scanned scope',
      scope.skipped.length ? 'unknown' : 'absent_in_scope');
    result.coverage = scope;
    if (scope.skipped.length) result.reason = reason;
    results.push(result);
  }
  return results;
}
