import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RuleResult } from '../../src/core/types.ts';
import { toSafe } from '../../src/core/safe.ts';
import { sha256 } from '../../src/core/sha256.ts';
import { assertNoLeaks } from '../../src/core/leakGuard.ts';
import { auditSecrets } from './supabase/functions/_shared/auditors/secrets.ts';
import { auditAuth } from './supabase/functions/_shared/auditors/auth.ts';
import { selectFiles } from './selection.ts';
import type { BlobEntry } from './selection.ts';

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const corpusRoot = join(productRoot, 'corpus', '.out');
export interface B1Output { results: RuleResult[]; findings: { rule_id: string; location: string }[]; unmapped: number; match_level: 'path'; partial_maps: string[] }
/** G(a) planted values and G(b) actual three-rule S44 detections remain separate from masking candidates. */
export function guardB1Output(output: B1Output, plantedValues: readonly string[], detectedValues: readonly string[]): B1Output {
  assertNoLeaks([JSON.stringify(output)], plantedValues, detectedValues); return output;
}
function inside(root: string, target: string): boolean { const rel = relative(root, target); return Boolean(rel) && rel !== '..' && !rel.startsWith('..' + '/') && !rel.startsWith('..' + '\\') && !isAbsolute(rel); }

/** Synthetic materialized cases only. This never accepts a live repository as comparator input. */
export async function runB1(caseDir: string, plantedValues: readonly string[] = [], detectedValues: readonly string[] = []): Promise<B1Output> {
  const requested = resolve(caseDir);
  if (!inside(corpusRoot, requested)) throw new Error('b1_input_outside_materialized_corpus');
  for (const directory of [join(productRoot, 'corpus'), corpusRoot]) if ((await lstat(directory)).isSymbolicLink()) throw new Error('b1_symlink_refused');
  const rootStat = await lstat(requested);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('b1_invalid_case_root');
  const actualCorpus = await realpath(corpusRoot); const actualRoot = await realpath(requested);
  if (!inside(actualCorpus, actualRoot)) throw new Error('b1_input_outside_materialized_corpus');
  const entries: BlobEntry[] = [];
  async function walk(dir: string): Promise<void> {
    for (const name of await readdir(dir)) {
      const absolute = join(dir, name); const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error('b1_symlink_refused');
      if (stat.isDirectory()) await walk(absolute);
      else if (stat.isFile()) entries.push({ type: 'blob', path: relative(actualRoot, absolute).replace(/\\/g, '/'), size: stat.size });
      else throw new Error('b1_non_regular_entry');
    }
  }
  await walk(actualRoot);
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const files = await selectFiles(entries, async path => {
    const absolute = resolve(actualRoot, path);
    if (!inside(actualRoot, absolute)) throw new Error('b1_unsafe_selected_path');
    const stat = await lstat(absolute); const actual = await realpath(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || !inside(actualRoot, actual)) throw new Error('b1_changed_selected_path');
    return readFile(actual, 'utf8');
  });
  const mapping: unknown = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), 'mapping.json'), 'utf8'));
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('b1_invalid_mapping');
  const mappings = mapping as Record<string, unknown>;
  const guarded = [...plantedValues,...detectedValues];
  // Do not keep evidence/context/title/secretHash or serialize the original findings.
  const kept = [...auditSecrets(files, 'repo'), ...auditAuth(files, 'repo')].map(item => ({ rule_id: item.rule_id, location: item.location }));
  const results: RuleResult[] = []; let unmapped = 0; const counts = new Map<string, number>();
  for (const finding of kept) {
    const mapped = mappings[finding.rule_id]; if (typeof mapped !== 'string') { unmapped++; continue; }
    const path = toSafe(finding.location.replace(/\\/g, '/'), guarded);
    const key = `${mapped}|${path}`; const count = (counts.get(key) ?? 0) + 1; counts.set(key, count);
    results.push({ rule_id: toSafe(mapped), family: mapped.startsWith('rls.') ? 'rls' : 'secrets', subject: path,
      state: 'flagged', concern: true, severity_hint: 'info',
      evidence: [],
      message: 'B1 path-level finding (original evidence discarded)', blind_spot: 'pinned pre-fix comparator; path-level only; env mapping partial',
      id: sha256(key + (count === 1 ? '' : `|#${count}`)) });
  }
  const output: B1Output = { results, findings: results.map(result => ({ rule_id: result.rule_id, location: result.subject })), unmapped, match_level: 'path', partial_maps: ['secrets.env_file_present'] };
  return guardB1Output(output, plantedValues, detectedValues);
}
