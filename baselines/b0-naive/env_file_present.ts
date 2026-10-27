import type { RepoSnapshot } from '../../src/core/types.ts';
import { draft } from '../../src/core/rules/common.ts';
import { blind, safeSubject } from './common.ts';
export function envFilePresent(snapshot: RepoSnapshot) {
  const results = snapshot.files.filter(file => /\.env/.test(file.path)).map(file => ({ ...draft('secrets.env_file_present', blind, 'naive env path substring matched'), subject: safeSubject(file.path) }));
  return results.length ? results : [draft('secrets.env_file_present', blind, 'naive baseline found no env path', 'absent_in_scope')];
}
