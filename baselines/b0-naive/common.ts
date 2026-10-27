import type { RepoSnapshot, RuleDraft, SnapshotFile } from '../../src/core/types.ts';
import { finding, draft } from '../../src/core/rules/common.ts';
import { toSafe } from '../../src/core/safe.ts';

export const blind = 'naive frozen B0 comparator; no completeness, boundary, placeholder or semantic guarantees';
export function lineMatches(snapshot: RepoSnapshot, id: string, pattern: RegExp, predicate: (file: SnapshotFile) => boolean = () => true): RuleDraft[] {
  const results: RuleDraft[] = [];
  for (const file of snapshot.files.filter(predicate)) {
    if (file.content === undefined) continue;
    for (const match of file.content.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))) {
      results.push(finding(id, blind, 'naive baseline pattern matched', file, match.index, match.index + match[0].length));
    }
  }
  return results.length ? results : [draft(id, blind, 'naive baseline found no match', 'absent_in_scope')];
}
export function repoResult(id: string, concern: boolean): RuleDraft[] {
  const result = draft(id, blind, concern ? 'naive baseline prerequisite string absent' : 'naive baseline prerequisite string present', concern ? 'absent_in_scope' : 'present');
  result.concern = concern; return [result];
}
export function safeSubject(value: string): string { return toSafe(value.replace(/\\/g, '/')); }
