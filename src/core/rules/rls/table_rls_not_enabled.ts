import type { Rule } from '../../types.ts';
import { coverage, isMigration } from '../../scope.ts';
import { draft, finding } from '../common.ts';
import { trackRls } from './track.ts';

// rule rls.table_rls_not_enabled
export const tableRlsNotEnabled: Rule = { id: 'rls.table_rls_not_enabled', evaluate(snapshot) {
  const tracking = trackRls(snapshot); const blind = 'dashboard or out-of-band changes; grants; RLS effectiveness and policy adequacy';
  const results = tracking.tables.map(table => {
    const reason = tracking.skipped ? 'migration_skipped' : table.reason;
    const result = finding('rls.table_rls_not_enabled', blind, reason ? 'table RLS state is unknown' : table.enabled ? 'RLS enablement statement present for this table' : 'tracked public table final RLS state is not enabled',
      table.file, table.statement.start, table.statement.end);
    result.subject = `table:${table.schema}.${table.name}`;
    result.state = reason ? 'unknown' : table.enabled ? 'present' : 'flagged'; result.concern = reason ? null : !table.enabled;
    if (reason) result.reason = reason; return result;
  });
  if (tracking.skipped || tracking.uncertain || !results.length) {
    const unknown = tracking.skipped || tracking.uncertain;
    const result = draft('rls.table_rls_not_enabled', blind, unknown ? 'migration scope or SQL effects are unresolved' : 'no tracked public tables in the scanned migrations', unknown ? 'unknown' : 'absent_in_scope');
    result.coverage = coverage(snapshot, isMigration, ['supabase/migrations/*.sql']);
    if (unknown) result.reason = tracking.skipped ? 'migration_skipped' : 'unresolved_sql';
    results.push(result);
  }
  return results;
} };
