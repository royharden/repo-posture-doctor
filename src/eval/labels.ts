import type { Span, State } from '../core/types.ts';

export type Split = 'dev' | 'heldout';
export type Cohort = 'single' | 'scene' | 'oos';
export const RULE_IDS = ['secrets.provider_key', 'secrets.service_role_jwt', 'secrets.secret_assignment', 'secrets.env_file_present', 'secrets.public_prefixed_secret', 'rls.table_rls_not_enabled', 'rls.literal_true_write_policy', 'tests.no_test_files', 'tests.no_test_script', 'tests.runner_not_in_ci', 'obs.empty_catch', 'obs.no_logging_library'];
export interface Label {
  case_id: string; split: Split; cohort: Cohort; group_id: string; rule_id: string;
  polarity: 'positive' | 'decoy' | 'expected_unknown'; level: 'line' | 'file' | 'table' | 'policy' | 'repo';
  path: string | null; span: Span | null; subject: string | null; expected_state: State | null; expected_concern: boolean | null;
}
export interface CorpusFile { path: string; content: string; encoding?: 'utf8' | 'base64' }
export interface CorpusCase { case_id: string; files: CorpusFile[] }
export interface Manifest {
  schemaVersion: 1; split: Split; seed: number; generatorSha: string; licence: 'MIT'; rulesVersion: string; rulesDigest: string;
  recipes: { groupId: string; ruleIds: string[]; cohort: Cohort; scaffold: string; mutation: string; recipe_hash: string }[];
  cases: { case_id: string; group_id: string; cohort: Cohort; rule_ids: string[]; files_sha256: string; unknown_reasons?: { rule_id: string; path: string | null; reason: string }[] }[];
  counts: { rule_id: string; polarity: Label['polarity']; cases: number; groups: number }[];
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_evaluation_input');
  return value as Record<string, unknown>;
}
export function digest(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 4_096; }
function id(value: unknown): value is string { return typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value) && !/(?:positive|decoy|heldout)/i.test(value); }
export function validPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 1_024 || /[<>:"|?*\u0000-\u001f\\]/.test(value) || value.startsWith('/')) return false;
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..' && !/[. ]$/.test(segment) &&
    !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment) && !['.git', 'node_modules', '.thinking', '.chatexports', '.creds'].includes(segment.toLowerCase()));
}
function validSpan(value: unknown): boolean {
  const s = object(value);
  return ['startLine', 'startCol', 'endLine', 'endCol'].every(key => Number.isSafeInteger(s[key]) && Number(s[key]) >= 1) &&
    (Number(s.endLine) > Number(s.startLine) || s.endLine === s.startLine && Number(s.endCol) >= Number(s.startCol));
}
export function validateLabels(input: unknown): Label[] {
  if (!Array.isArray(input) || input.length > 200_000) throw new Error('invalid_labels');
  const seen = new Set<string>();
  return input.map(value => {
    const l = object(value);
    if (!id(l.case_id) || !['dev', 'heldout'].includes(String(l.split)) || !['single', 'scene', 'oos'].includes(String(l.cohort)) || !text(l.group_id) ||
      !(RULE_IDS.includes(String(l.rule_id)) || l.rule_id === 'secrets.*' && l.cohort === 'oos') || !['positive', 'decoy', 'expected_unknown'].includes(String(l.polarity)) ||
      !['line', 'file', 'table', 'policy', 'repo'].includes(String(l.level)) || !(l.path === null || validPath(l.path)) ||
      !(l.subject === null || text(l.subject)) || !(l.span === null || validSpan(l.span)) ||
      !(l.expected_state === null || ['flagged', 'present', 'absent_in_scope', 'unknown'].includes(String(l.expected_state))) ||
      !(l.expected_concern === null || typeof l.expected_concern === 'boolean')) throw new Error('invalid_label');
    const subjectLevel = ['repo', 'table', 'policy'].includes(String(l.level));
    if (subjectLevel ? l.subject === null : l.subject !== null || l.path === null) throw new Error('invalid_label_subject');
    if (l.level === 'repo' && (l.subject !== 'root' || l.path !== null || l.span !== null)) throw new Error('invalid_repo_label');
    if (l.level === 'table' && !String(l.subject).startsWith('table:') || l.level === 'policy' && !String(l.subject).startsWith('policy:')) throw new Error('invalid_label_subject');
    if (l.polarity === 'expected_unknown' && (l.expected_state !== 'unknown' || l.expected_concern !== null)) throw new Error('invalid_unknown_label');
    if (l.polarity === 'positive' && (l.expected_concern !== true || !['flagged', 'absent_in_scope'].includes(String(l.expected_state)))) throw new Error('invalid_positive_label');
    if (l.polarity === 'decoy' && (l.expected_concern !== false || ![null, 'present'].includes(l.expected_state as null | 'present'))) throw new Error('invalid_decoy_label');
    if (l.level === 'line' && l.polarity !== 'expected_unknown' && l.span === null) throw new Error('missing_label_span');
    if (l.rule_id !== 'secrets.*') {
      const expectedLevel = l.rule_id === 'secrets.env_file_present' ? 'file' : l.rule_id === 'rls.table_rls_not_enabled' ? 'table' : l.rule_id === 'rls.literal_true_write_policy' ? 'policy' : ['tests.no_test_files','tests.no_test_script','tests.runner_not_in_ci','obs.no_logging_library'].includes(String(l.rule_id)) ? 'repo' : 'line';
      if(l.level!==expectedLevel)throw new Error('label_rule_level_mismatch');
    }
    if(l.level==='file'&&l.span!==null)throw new Error('invalid_file_span');
    const key = JSON.stringify([l.case_id,l.rule_id,l.level,l.path,l.span,l.subject]);
    if (seen.has(key)) throw new Error('duplicate_label'); seen.add(key);
    return l as unknown as Label;
  });
}
export function validateCases(input: unknown): CorpusCase[] {
  if (!Array.isArray(input) || input.length > 100_000) throw new Error('invalid_cases');
  const seen = new Set<string>();
  return input.map(value => {
    const c = object(value);
    if (!id(c.case_id) || seen.has(c.case_id) || !Array.isArray(c.files) || c.files.length > 10_000) throw new Error('invalid_case');
    seen.add(c.case_id); const paths = new Set<string>();
    for (const value of c.files) {
      const f = object(value);
      if (!validPath(f.path) || paths.has(f.path.toLowerCase()) || typeof f.content !== 'string' || f.encoding !== undefined && !['utf8', 'base64'].includes(String(f.encoding))) throw new Error('invalid_corpus_file');
      paths.add(f.path.toLowerCase());
      if (f.encoding === 'base64' && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.content)) throw new Error('invalid_base64');
    }
    return c as unknown as CorpusCase;
  });
}
export function validateManifest(input: unknown): Manifest {
  const m = object(input);
  if (m.schemaVersion !== 1 || !['dev', 'heldout'].includes(String(m.split)) || !Number.isSafeInteger(m.seed) || !digest(m.generatorSha) || m.licence !== 'MIT' || !text(m.rulesVersion) || !digest(m.rulesDigest) ||
    !Array.isArray(m.recipes) || !Array.isArray(m.cases) || !Array.isArray(m.counts)) throw new Error('invalid_manifest');
  const groups = new Set<string>(); const cases = new Set<string>(); const recipes = new Map<string, Record<string, unknown>>();
  for (const value of m.recipes) {
    const r = object(value);
    if (!text(r.groupId) || groups.has(r.groupId) || !Array.isArray(r.ruleIds) || !r.ruleIds.length || !r.ruleIds.every(v => RULE_IDS.includes(String(v)) || v === 'secrets.*') || !['single','scene','oos'].includes(String(r.cohort)) || !text(r.scaffold) || !text(r.mutation) || !digest(r.recipe_hash)) throw new Error('invalid_recipe');
    groups.add(r.groupId); recipes.set(r.groupId, r);
  }
  for (const value of m.cases) {
    const c = object(value); const recipe = recipes.get(String(c.group_id));
    if (!id(c.case_id) || cases.has(c.case_id) || !recipe || c.cohort !== recipe.cohort || !digest(c.files_sha256) || !Array.isArray(c.rule_ids) || !c.rule_ids.every(v => (recipe.ruleIds as unknown[]).includes(v))) throw new Error('invalid_manifest_case');
    cases.add(c.case_id);
    if (c.unknown_reasons !== undefined && (!Array.isArray(c.unknown_reasons) || !c.unknown_reasons.every(value => { const u = object(value); return RULE_IDS.includes(String(u.rule_id)) && (u.path === null || validPath(u.path)) && text(u.reason); }))) throw new Error('invalid_unknown_reasons');
  }
  for (const value of m.counts) { const c = object(value); if (!RULE_IDS.includes(String(c.rule_id)) && c.rule_id !== 'secrets.*' || !['positive','decoy','expected_unknown'].includes(String(c.polarity)) || !Number.isSafeInteger(c.cases) || Number(c.cases) < 0 || !Number.isSafeInteger(c.groups) || Number(c.groups) < 0) throw new Error('invalid_manifest_counts'); }
  return m as unknown as Manifest;
}
