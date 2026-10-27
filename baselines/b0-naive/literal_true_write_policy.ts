import type { RepoSnapshot } from '../../src/core/types.ts';
import { lineMatches, safeSubject } from './common.ts';
export function literalTrueWritePolicy(snapshot: RepoSnapshot) {
  const results = lineMatches(snapshot, 'rls.literal_true_write_policy', /using\s*\(\s*true\s*\)/gi);
  for (const result of results) {
    const pointer = result.evidence[0]; if (!pointer) continue;
    const file = snapshot.files.find(item => item.path === pointer.path); if (!file?.content) continue;
    const lines = file.content.split('\n'); const offset = lines.slice(0, pointer.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + pointer.col - 1;
    const statement = file.content.slice(file.content.lastIndexOf(';', offset) + 1, offset);
    const match = /create\s+policy\s+(\w+)\s+on\s+([\w.]+)/i.exec(statement);
    result.subject = match ? safeSubject(`policy:${match[2].includes('.') ? match[2].toLowerCase() : 'public.' + match[2].toLowerCase()}.${match[1].toLowerCase()}`) : 'root';
  }
  return results;
}
