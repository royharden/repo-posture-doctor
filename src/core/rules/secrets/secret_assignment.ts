import type { Rule, RuleDraft } from '../../types.ts';
import { findCandidates } from '../../safe.ts';
import { finding, summarize } from '../common.ts';
import { assignmentFile, assignmentPositive, isReadable } from './shared.ts';

// rule secrets.secret_assignment
export const secretAssignment: Rule = { id: 'secrets.secret_assignment', evaluate(snapshot, config) {
  const results: RuleDraft[] = []; const blind = 'low-entropy passwords; neutrally named secrets; entropy is not proof of secrecy';
  for (const file of snapshot.files.filter(file => isReadable(file) && assignmentFile(file))) for (const candidate of findCandidates(file.content!)) {
    if (!assignmentPositive(candidate, config)) continue;
    results.push(finding('secrets.secret_assignment', blind, 'high-entropy literal assigned to a sensitive name', file, candidate.start, candidate.end));
  }
  return summarize(snapshot, results, 'secrets.secret_assignment', blind, assignmentFile, ['TS/JS', 'JSON', 'YAML', 'env templates']);
} };
