import type { Report, RuleResult } from '../core/types.ts';
import { toSafe } from '../core/safe.ts';
import type { Cohort, Label, Split } from './labels.ts';

export interface MetricCounts {
  P: number; TP: number; FN: number; D: number; FA: number; decoy_FA: number; TN: number;
  abstained_positives: number; abstained_decoys: number; expected_unknown: number; correct_unknown: number;
  missed_unknown: number; overclaimed_present: number; U: number; Dup: number; errors: number;
  confusion: Record<string, number>;
}
export interface CaseScore extends MetricCounts { case_id: string; group_id: string; rule_id: string; cohort: Cohort; split: Split; match_level: 'native' | 'path' }
export function emptyCounts(): MetricCounts { return { P:0,TP:0,FN:0,D:0,FA:0,decoy_FA:0,TN:0,abstained_positives:0,abstained_decoys:0,expected_unknown:0,correct_unknown:0,missed_unknown:0,overclaimed_present:0,U:0,Dup:0,errors:0,confusion:{} }; }
const pathSafe = (path: string): string => toSafe(path.replace(/\\/g, '/'));
function ruleMatches(label: Label, result: RuleResult): boolean { return label.rule_id === result.rule_id || label.rule_id === 'secrets.*' && result.family === 'secrets'; }
function resultPaths(result: RuleResult): string[] { return [...result.evidence.map(pointer => pointer.path), ...(result.rule_id === 'secrets.env_file_present' && result.subject !== 'root' ? [result.subject] : [])]; }
function matches(label: Label, result: RuleResult, level: 'native'|'path'): boolean {
  if (!ruleMatches(label, result)) return false;
  if (level === 'path') return label.path !== null && (resultPaths(result).includes(pathSafe(label.path)) || result.subject === pathSafe(label.path));
  if (label.subject !== null) return label.subject === result.subject;
  if (label.path === null || !resultPaths(result).includes(pathSafe(label.path))) return false;
  if (label.level !== 'line' || label.span === null) return true;
  const span = label.span;
  const before = (lineA: number,colA:number,lineB:number,colB:number): boolean => lineA < lineB || lineA === lineB && colA < colB;
  return result.evidence.some(pointer => pointer.path === pathSafe(label.path!) &&
    !before(pointer.endLine,pointer.endCol,span.startLine,span.startCol) && !before(span.endLine,span.endCol,pointer.line,pointer.col));
}
/** Same path/summary conditions serve unknown scoring and abstention accounting. */
export function isUnknown(label: Label, report: Report): boolean {
  const results = report.results.filter(result => ruleMatches(label,result));
  if (label.subject !== null) {
    const exact = results.filter(result => result.subject === label.subject);
    if (exact.length) return exact.some(result => result.state === 'unknown');
    return (label.level === 'table' || label.level === 'policy') && results.some(result => result.subject === 'root' && result.state === 'unknown');
  }
  if (label.path === null || !results.some(result => result.subject === 'root' && result.state === 'unknown')) return false;
  const path = pathSafe(label.path);
  const skipped = report.scope.skipped_paths.some(item => item.path === path);
  const named = results.some(result => resultPaths(result).includes(path));
  return skipped || !report.scope.inventory_complete && !named;
}

export function scoreCase(case_id: string, allLabels: readonly Label[], report: Report | null,
  options: { match_level?: 'native'|'path'; hard_error?: boolean } = {}): CaseScore[] {
  if (options.hard_error) report = null;
  const labels = allLabels.filter(label => label.case_id === case_id);
  if (!labels.length) throw new Error('case_has_no_labels');
  const level = options.match_level ?? 'native'; const rows = new Map<string,CaseScore>();
  const rowFor = (label: Label): CaseScore => {
    const key = `${label.rule_id}|${label.cohort}|${label.group_id}`;
    let row = rows.get(key);
    if (!row) { row = { ...emptyCounts(),case_id,group_id:label.group_id,rule_id:label.rule_id,cohort:label.cohort,split:label.split,match_level:level }; rows.set(key,row); }
    return row;
  };
  labels.forEach(rowFor);
  const predictions = report?.results.filter(result => result.concern === true) ?? [];
  const used = new Set<number>(); const hits = new Map<number,RuleResult>();
  for (const prediction of predictions) {
    const candidates = labels.map((label,index) => ({label,index})).filter(({label}) => matches(label,prediction,level));
    const available = candidates.find(({index}) => !used.has(index));
    if (available) { used.add(available.index); hits.set(available.index,prediction); }
    else if (candidates.length) rowFor(candidates[0].label).Dup += 1;
    else if (labels[0].cohort === 'scene') {
      const anchor = labels.find(label => label.rule_id === prediction.rule_id) ?? { ...labels[0],rule_id:prediction.rule_id };
      rowFor(anchor).U += 1;
    }
  }
  labels.forEach((label,index) => {
    const row = rowFor(label); const hit = hits.get(index); const unknown = report !== null && isUnknown(label,report);
    const exact = report?.results.find(result => ruleMatches(label,result) && (label.subject !== null ? result.subject === label.subject : matches(label,result,level)));
    const returned = hit?.state ?? (unknown ? 'unknown' : exact?.state ?? 'none');
    if (label.level === 'repo') { const key = `${label.expected_state ?? 'none'}->${returned}`; row.confusion[key] = (row.confusion[key] ?? 0)+1; }
    if (label.polarity === 'positive') { row.P += 1; if (hit) row.TP += 1; else row.FN += 1; if (unknown && !hit) row.abstained_positives += 1; }
    else if (label.polarity === 'decoy') { row.D += 1; if (hit) {row.FA += 1;row.decoy_FA += 1;} else if (unknown) row.abstained_decoys += 1; else if (!options.hard_error && report) row.TN += 1; }
    else { row.expected_unknown += 1; if (hit || exact?.state === 'absent_in_scope') row.FA += 1; else if (unknown) row.correct_unknown += 1; else if (exact?.state === 'present') row.overclaimed_present += 1; else row.missed_unknown += 1; }
  });
  if (options.hard_error || !report) for (const row of rows.values()) row.errors = 1;
  return [...rows.values()];
}
