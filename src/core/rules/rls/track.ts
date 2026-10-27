import type { RepoSnapshot, SnapshotFile } from '../../types.ts';
import { isMigration } from '../../scope.ts';
import { identifierAt, keyword, tokenizeSql } from '../../sql/tokenize.ts';
import type { SqlStatement, SqlToken } from '../../sql/tokenize.ts';

export interface TrackedTable { schema: string; name: string; enabled: boolean; reason?: string; file: SnapshotFile; statement: SqlStatement }
export interface TrackedPolicy { schema: string; table: string; name: string; file: SnapshotFile; statement: SqlStatement }
export interface RlsTracking { tables: TrackedTable[]; policies: TrackedPolicy[]; skipped: boolean; uncertain: boolean }
function tableKey(schema: string, name: string): string { return JSON.stringify([schema, name]); }
function words(tokens: readonly SqlToken[], at: number, list: string[]): boolean { return list.every((word, index) => keyword(tokens[at + index], word)); }
function literalTrue(tokens: readonly SqlToken[]): boolean {
  let start = 0; let end = tokens.length;
  while (tokens[start]?.value === '(' && tokens[end - 1]?.value === ')') {
    let depth = 0; let encloses = true;
    for (let at = start; at < end - 1; at++) { if (tokens[at]?.value === '(') depth++; if (tokens[at]?.value === ')') depth--; if (!depth) { encloses = false; break; } }
    if (!encloses) break; start++; end--;
  }
  return end - start === 1 && keyword(tokens[start], 'true');
}
function policyIsConcerning(tokens: readonly SqlToken[], afterTable: number): boolean | null {
  let command = 'all'; let permissive = true; let roles: string[] | null = null; let clauseTrue = false;
  for (let at = afterTable; at < tokens.length; at++) {
    if (keyword(tokens[at], 'as')) {
      if (!keyword(tokens[at + 1], 'permissive') && !keyword(tokens[at + 1], 'restrictive')) return null;
      permissive = keyword(tokens[++at], 'permissive');
    } else if (keyword(tokens[at], 'for')) {
      const value = tokens[++at]; if (!value || !['all', 'insert', 'update', 'delete', 'select'].includes(value.value)) return null;
      command = value.value;
    } else if (keyword(tokens[at], 'to')) {
      roles = [];
      while (at + 1 < tokens.length && !keyword(tokens[at + 1], 'using') && !keyword(tokens[at + 1], 'with')) {
        const role = tokens[++at]!;
        if (role.value === ',') continue;
        if (role.kind !== 'word' && role.kind !== 'identifier') return null;
        roles.push(role.value);
      }
      if (!roles.length) return null;
    } else if (keyword(tokens[at], 'using') || words(tokens, at, ['with', 'check'])) {
      if (keyword(tokens[at], 'with')) at++;
      if (tokens[++at]?.value !== '(') return null;
      const begin = at; let depth = 1;
      while (++at < tokens.length && depth) { if (tokens[at]?.value === '(') depth++; if (tokens[at]?.value === ')') depth--; }
      if (depth) return null;
      // at is one past the closing token after the loop's increment condition.
      const close = at - 1;
      if (literalTrue(tokens.slice(begin + 1, close))) clauseTrue = true;
      at = close;
    } else return null;
  }
  return permissive && command !== 'select' && (roles === null || roles.some(role => ['public', 'anon', 'authenticated'].includes(role))) && clauseTrue;
}

export function trackRls(snapshot: RepoSnapshot): RlsTracking {
  const tables = new Map<string, TrackedTable>(); const policies = new Map<string, TrackedPolicy>();
  let uncertain = false;
  const migrations = snapshot.files.filter(isMigration).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const skipped = !snapshot.scope.inventory_complete || migrations.some(file => Boolean(file.skipped) || file.content === undefined);
  const invalidateAll = (reason: string): void => { uncertain = true; for (const table of tables.values()) table.reason = reason; };
  for (const file of migrations) {
    if (file.skipped || file.content === undefined) continue;
    for (const statement of tokenizeSql(file.content)) {
      const t = statement.tokens;
      if (statement.invalid) { invalidateAll('parse_failure'); continue; }
      if (keyword(t[0], 'do') || keyword(t[0], 'execute') || keyword(t[0], 'call')) { invalidateAll('dynamic_sql'); continue; }
      if (words(t, 0, ['create', 'table'])) {
        let at = 2; const ifNotExists = words(t, at, ['if', 'not', 'exists']); if (ifNotExists) at += 3;
        const name = identifierAt(t, at);
        if (!name || (t[name.next]?.value !== '(' && !keyword(t[name.next], 'as') && !keyword(t[name.next], 'partition'))) { invalidateAll('parse_failure'); continue; }
        if (name.schema !== 'public') continue;
        const key = tableKey(name.schema, name.name);
        if (!ifNotExists || !tables.has(key)) tables.set(key, { schema: name.schema, name: name.name, enabled: false, file, statement, ...(uncertain ? { reason: 'prior_unresolved_sql' } : {}) });
      } else if (words(t, 0, ['drop', 'table'])) {
        let at = words(t, 2, ['if', 'exists']) ? 4 : 2;
        while (at < t.length) {
          const name = identifierAt(t, at); if (!name) { invalidateAll('parse_failure'); break; }
          tables.delete(tableKey(name.schema, name.name));
          for (const [key, policy] of policies) if (policy.schema === name.schema && policy.table === name.name) policies.delete(key);
          at = name.next;
          if (t[at]?.value === ',') { at++; continue; }
          if (at < t.length && !keyword(t[at], 'cascade') && !keyword(t[at], 'restrict')) invalidateAll('parse_failure');
          break;
        }
      } else if (words(t, 0, ['alter', 'table'])) {
        let at = 2; if (words(t, at, ['if', 'exists'])) at += 2; if (keyword(t[at], 'only')) at++;
        const name = identifierAt(t, at); if (!name) { invalidateAll('parse_failure'); continue; }
        const table = tables.get(tableKey(name.schema, name.name)); at = name.next;
        if (keyword(t[at], 'rename') || words(t, at, ['set', 'schema'])) {
          if (table) table.reason = 'unsupported_table_change';
          uncertain = true; continue;
        }
        if (words(t, at + 1, ['row', 'level', 'security']) && (keyword(t[at], 'enable') || keyword(t[at], 'disable')) && at + 4 === t.length) {
          if (table) table.enabled = keyword(t[at], 'enable');
        } else if (keyword(t[at], 'enable') || keyword(t[at], 'disable')) {
          if (table) table.reason = 'parse_failure'; uncertain = true;
        } else if (!['add', 'drop', 'alter', 'owner', 'force', 'no', 'set', 'reset', 'validate', 'cluster', 'replica', 'inherit'].some(word => keyword(t[at], word))) {
          if (table) table.reason = 'unsupported_table_change'; uncertain = true;
        }
        // ADD/DROP/ALTER columns and FORCE/NO FORCE do not change enablement.
      } else if (words(t, 0, ['create', 'policy'])) {
        const policyName = t[2];
        if (!policyName || !['word', 'identifier'].includes(policyName.kind) || !keyword(t[3], 'on')) { invalidateAll('parse_failure'); continue; }
        const name = identifierAt(t, 4); if (!name) { invalidateAll('parse_failure'); continue; }
        const concerning = policyIsConcerning(t, name.next);
        if (concerning === null) { invalidateAll('parse_failure'); continue; }
        if (concerning && tables.has(tableKey(name.schema, name.name))) policies.set(JSON.stringify([name.schema, name.name, policyName.value]), { schema: name.schema, table: name.name, name: policyName.value, file, statement });
      } else if (words(t, 0, ['drop', 'policy'])) {
        let at = words(t, 2, ['if', 'exists']) ? 4 : 2; const policyName = t[at++];
        if (!policyName || !keyword(t[at++], 'on')) { invalidateAll('parse_failure'); continue; }
        const name = identifierAt(t, at); if (!name) { invalidateAll('parse_failure'); continue; }
        policies.delete(JSON.stringify([name.schema, name.name, policyName.value]));
      } else if (words(t, 0, ['alter', 'policy'])) {
        invalidateAll('unsupported_policy_change');
      } else if (keyword(t[0], 'create') && t.some(token => keyword(token, 'table'))) {
        // Temporary/unlogged/partition variants need explicit interpretation rather than silent absence.
        invalidateAll('unsupported_create_table');
      } else if (!['begin', 'commit', 'rollback', 'set', 'grant', 'revoke', 'comment', 'insert', 'update', 'delete', 'select', 'create', 'alter', 'drop', 'truncate'].some(word => keyword(t[0], word))) {
        invalidateAll('parse_failure');
      }
    }
  }
  return { tables: [...tables.values()], policies: [...policies.values()], skipped, uncertain };
}
