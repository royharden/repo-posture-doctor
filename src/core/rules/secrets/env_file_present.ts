import type { Rule, RuleDraft } from '../../types.ts';
import { toSafe } from '../../safe.ts';
import { normalizePath } from '../../scope.ts';
import { draft, summarize } from '../common.ts';

export function envName(path: string): boolean {
  const name = normalizePath(path).split('/').at(-1) ?? '';
  return /^\.env(?:\..+)?$/.test(name) && !/^\.env\.(?:example|sample|template)$/.test(name);
}
// rule secrets.env_file_present
export const envFilePresent: Rule = { id: 'secrets.env_file_present', evaluate(snapshot) {
  const results: RuleDraft[] = []; const blind = 'blank-value env files are reported; folder presence is not proof of commitment; denied folders are out of scope';
  for (const file of snapshot.files) if (envName(file.path) && file.size > 0 && !file.skipped) {
    const result = draft('secrets.env_file_present', blind, 'non-empty non-template env file present (metadata only)');
    result.subject = toSafe(normalizePath(file.path)); results.push(result);
  }
  return summarize(snapshot, results, 'secrets.env_file_present', blind, file => envName(file.path), ['path inventory; env file metadata']);
} };
