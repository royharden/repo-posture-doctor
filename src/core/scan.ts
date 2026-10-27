import type { Report, RepoSnapshot, Rule, RuleConfig, RuleDraft, RuleResult } from './types.ts';
import { DEFAULT_CONFIG } from './config.ts';
import { sha256 } from './sha256.ts';
import { safeValue } from './report/json.ts';
import { rules as defaultRules } from './rules/index.ts';
import { detectedSecretValues } from './rules/secrets/index.ts';
import { NOT_CHECKED } from './notChecked.ts';
import { safeExcerpt } from './safe.ts';

function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function evidenceKey(result: RuleDraft): string {
  return JSON.stringify(result.evidence.map(pointer => [pointer.path, pointer.line, pointer.col, pointer.endLine, pointer.endCol, pointer.excerpt]));
}

/** The core is deterministic: caller supplies the inventory, text and config, with no ambient I/O. */
export function scan(snapshot: RepoSnapshot, selectedRules: readonly Rule[] = defaultRules, config: RuleConfig = DEFAULT_CONFIG): Report {
  const ordered: RepoSnapshot = { ...snapshot, files: [...snapshot.files].sort((a, b) => compare(a.path.replace(/\\/g, '/'), b.path.replace(/\\/g, '/'))) };
  const detectedValues = detectedSecretValues(ordered, config);
  const internalDrafts = selectedRules.flatMap(rule => rule.evaluate(ordered, config));
  const parsePaths = [...new Set(internalDrafts.flatMap(result => result.unknown_paths ?? []))];
  const reportScope = { ...snapshot.scope, skipped: snapshot.scope.skipped.map(item=>({...item})), skipped_paths: snapshot.scope.skipped_paths.map(item=>({...item})) };
  if (parsePaths.length) {
    reportScope.content_complete = false;
    const reason = reportScope.skipped.find(item=>item.reason === 'parse_failure');
    if (reason) reason.count += parsePaths.length; else reportScope.skipped.push({reason:'parse_failure', count:parsePaths.length});
    for (const path of parsePaths) if(reportScope.skipped_paths.length < reportScope.limits.max_files && !reportScope.skipped_paths.some(item=>item.path === path && item.reason === 'parse_failure')) reportScope.skipped_paths.push({path,reason:'parse_failure'});
    reportScope.skipped_paths.sort((a,b)=>compare(a.path,b.path)); reportScope.skipped.sort((a,b)=>compare(a.reason,b.reason));
  }
  const drafts = internalDrafts.map(result => { const { unknown_paths: internalPaths, ...publicDraft } = result; void internalPaths; return publicDraft; });
  const offsetAt = (content: string, line: number, col: number): number => {
    let offset = 0;
    for (let row = 1; row < line; row += 1) { const next = content.indexOf('\n', offset); if (next === -1) return content.length; offset = next + 1; }
    return Math.min(content.length, offset + Math.max(0, col - 1));
  };
  const safeDrafts = safeValue(drafts.map(result => ({ ...result,
    concern: result.state === 'unknown' ? null : result.concern === true,
    evidence: result.evidence.map(pointer => {
      const file = ordered.files.find(item => item.path === pointer.path);
      if (file?.content === undefined) return pointer;
      const start = offsetAt(file.content, pointer.line, pointer.col);
      const end = offsetAt(file.content, pointer.endLine, pointer.endCol) + 1;
      return { ...pointer, excerpt: safeExcerpt(file.content, start, end, detectedValues) };
    }),
  })), detectedValues);
  safeDrafts.sort((a, b) => compare(a.rule_id, b.rule_id) || compare(a.subject, b.subject) || compare(evidenceKey(a), evidenceKey(b)));
  const counts = new Map<string, number>();
  const results: RuleResult[] = safeDrafts.map(result => {
    const base = `${result.rule_id}|${result.subject}`;
    const count = (counts.get(base) ?? 0) + 1; counts.set(base, count);
    return { ...result, id: sha256(count === 1 ? base : `${base}|#${count}`) };
  });
  return safeValue({ schema_version: 1, tool_version: '0.1.0', rules_version: 'v1.0-draft',
    scope: { ...reportScope, root_label: snapshot.root_label }, results, not_checked: NOT_CHECKED.map(item=>({...item})) }, detectedValues) as Report;
}
