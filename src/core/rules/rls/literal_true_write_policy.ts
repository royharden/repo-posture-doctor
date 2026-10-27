import type { Rule } from '../../types.ts';
import { coverage, isMigration } from '../../scope.ts';
import { draft, finding } from '../common.ts';
import { trackRls } from './track.ts';

// rule rls.literal_true_write_policy
export const literalTrueWritePolicy: Rule = { id: 'rls.literal_true_write_policy', evaluate(snapshot) {
  const tracking = trackRls(snapshot); const blind = 'non-literal always-true expressions; restrictive neutralisation; grants; not proof that anyone can write';
  const results = tracking.policies.map(policy => {
    const result = finding('rls.literal_true_write_policy', blind, 'literal true clause present in a permissive write policy', policy.file, policy.statement.start, policy.statement.end);
    result.subject = `policy:${policy.schema}.${policy.table}.${policy.name}`; return result;
  });
  if (tracking.skipped || tracking.uncertain || !results.length) {
    const unknown = tracking.skipped || tracking.uncertain;
    const result = draft('rls.literal_true_write_policy', blind, unknown ? 'migration scope or policy SQL effects are unresolved' : 'no qualifying literal true write policy in the scanned migrations', unknown ? 'unknown' : 'absent_in_scope');
    result.coverage = coverage(snapshot, isMigration, ['supabase/migrations/*.sql']);
    if (unknown) result.reason = tracking.skipped ? 'migration_skipped' : 'unresolved_sql'; results.push(result);
  }
  return results;
} };
