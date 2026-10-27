import type { RepoSnapshot } from '../../src/core/types.ts';
import { finding, draft } from '../../src/core/rules/common.ts';
import { blind, safeSubject } from './common.ts';
export function tableRlsNotEnabled(snapshot: RepoSnapshot) {
  const results = [];
  for (const file of snapshot.files) {
    if (!file.content || /row level security/i.test(file.content)) continue;
    for (const match of file.content.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)/gi)) {
      const result = finding('rls.table_rls_not_enabled', blind, 'naive create-table file lacks RLS string', file, match.index, match.index + match[0].length);
      result.subject = safeSubject('table:' + (match[1].includes('.') ? match[1].toLowerCase() : 'public.' + match[1].toLowerCase())); results.push(result);
    }
  }
  return results.length ? results : [draft('rls.table_rls_not_enabled', blind, 'naive baseline found no match', 'absent_in_scope')];
}
