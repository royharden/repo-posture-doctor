import { describe, expect, it } from 'vitest';
import { createSnapshot } from '../src/core/snapshot.ts';
import { DEFAULT_CONFIG } from '../src/core/config.ts';
import { rules } from '../src/core/rules/index.ts';
import { tokenizeSql } from '../src/core/sql/tokenize.ts';
import { scan } from '../src/core/scan.ts';
import { classifyPath } from '../src/core/snapshot.ts';
import { jwtRole } from '../src/core/rules/secrets/shared.ts';
import type { SnapshotFile } from '../src/core/types.ts';

// Builder unit fixtures only: never imported or scored by the corpus evaluator.
function file(path: string, content: string): SnapshotFile { return { path, content, size: new TextEncoder().encode(content).length, kind: classifyPath(path) }; }
function evaluate(entries: SnapshotFile[], rule: string) {
  const selected = rules.find(item => item.id === rule)!;
  return selected.evaluate(createSnapshot('fixture', entries), DEFAULT_CONFIG);
}
const body = Array.from({ length: 45 }, (_, index) => 'q7Zm2Pv9Na4Rx6Kc3Tj8Ws5Hy1Bd0Lf'[index * 11 % 32]).join('');
const token = (prefix: string[], value = body): string => prefix.join('') + value;
function jwt(role: string, padding = false): string {
  const encode = (value: string): string => Buffer.from(value).toString(padding ? 'base64' : 'base64url').replace(/\+/g, '-').replace(/\//g, '_');
  return [encode('{"alg":"none"}'), encode(JSON.stringify({ role })), 'signature'].join('.');
}

describe('secrets regression contracts (not run in Dirty Mode)', () => {
  it('does not match hyphenated identifiers and classifies Anthropic exactly once', () => {
    expect(evaluate([file('src/a.ts', 'task-management-dashboard-widget')], 'secrets.provider_key').filter(result => result.concern)).toHaveLength(0);
    expect(evaluate([file('src/a.ts', token(['sk', '-ant-']))], 'secrets.provider_key').filter(result => result.concern)).toHaveLength(1);
  });
  it('requires left boundaries and excludes placeholders/wrong lengths', () => {
    const values = ['prefix' + token(['sk', '-']), token(['sk', '-'], 'x'.repeat(40)), token(['sk', '-'], 'tiny'), token(['pk', '_live_'])];
    expect(evaluate([file('src/a.ts', values.join('\n'))], 'secrets.provider_key').some(result => result.concern)).toBe(false);
  });
  it('covers every listed provider family and never detects the Stripe restricted test prefix', () => {
    const values = [token(['sk', '-']), token(['sk', '-proj-']), token(['sk', '-ant-']), token(['sk', '_live_']), token(['rk', '_live_']), token(['sk', '_test_']),
      token(['AK', 'IA'], 'Q7ZM2PV9NA4RX6KC'), token(['gh', 'p_']), token(['gh', 'o_']), token(['gh', 'u_']), token(['gh', 's_']), token(['gh', 'r_']), token(['github', '_pat_']),
      token(['xox', 'b-']), token(['AI', 'za'], body.slice(0, 35))];
    expect(evaluate([file('src/a.ts', values.join('\n'))], 'secrets.provider_key').filter(result => result.concern)).toHaveLength(values.length);
    expect(evaluate([file('src/a.ts', token(['rk', '_test_']))], 'secrets.provider_key').some(result => result.concern)).toBe(false);
  });
  it('does not use stateful tests for repeated matches or quadratic sensitive names', () => {
    expect(evaluate([file('src/a.ts', [token(['sk', '-']), token(['sk', '-'], body.split('').reverse().join(''))].join('\n'))], 'secrets.provider_key').filter(result => result.concern)).toHaveLength(2);
    expect(evaluate([file('src/a.ts', 'A'.repeat(80_000))], 'secrets.public_prefixed_secret').some(result => result.concern)).toBe(false);
  });
  it('decodes bounded JWT role claims, including padding; rejects malformed/non-JSON claims', () => {
    expect(jwtRole(jwt('service_role'))).toBe('service_role'); expect(jwtRole(jwt('service_role', true))).toBe('service_role');
    expect(evaluate([file('src/a.ts', [jwt('service_role'), jwt('anon'), jwt('authenticated')].join('\n'))], 'secrets.service_role_jwt').filter(result => result.concern)).toHaveLength(1);
    expect(jwtRole('bad.invalid.signature')).toBeNull(); expect(jwtRole('bad.' + 'A'.repeat(20_000) + '.signature')).toBeNull();
    expect(jwtRole(['header', Buffer.from('{}').toString('base64url'), 'signature'].join('.'))).toBeNull();
  });
  it('matches sensitive assignment names and excludes alphabet, UUID, URL and interpolation decoys', () => {
    const text = `const stripeSecret = "${body}";\nconst keyboard = "${body}";\nconst TOKEN = "abcdefghijklmnopqrstuvwxyz";\nconst apiKey = "https://example.invalid/path/to/value";\nconst privateKey = "123e4567-e89b-12d3-a456-426614174000";\nconst password = \`\u0024{TOKEN}not-a-literal-body\`;`;
    expect(evaluate([file('src/a.ts', text)], 'secrets.secret_assignment').filter(result => result.concern)).toHaveLength(1);
    const json = evaluate([file('config.json', JSON.stringify({ API_KEY: body }))], 'secrets.secret_assignment').find(result => result.concern)!;
    expect(json.evidence[0]?.col).toBe('{"API_KEY":"'.length + 1);
  });
  it('reports only names for public prefixes and treats env bodies as metadata', () => {
    const text = 'process.env.NEXT_PUBLIC_SERVICE_ROLE; import.meta.env.VITE_SUPABASE_ANON_KEY; const PUBLIC_PASSWORD = "value";';
    expect(evaluate([file('src/a.ts', text)], 'secrets.public_prefixed_secret').filter(result => result.concern)).toHaveLength(2);
    expect(evaluate([file('.env.example', 'SAFE=example'), file('.envrc', 'text'), file('.env', body), file('.env.local', '')], 'secrets.env_file_present').filter(result => result.concern).map(result => result.subject)).toEqual(['.env']);
  });
  it('uses marker-only PEM evidence and masks surrounding secrets deterministically', () => {
    const marker = ['-----BEG', 'IN RSA PRIV', 'ATE KEY-----'].join('');
    const content = JSON.stringify({ private_key: marker + '\\n' + body + '\\n' + ['-----END RSA PRIV', 'ATE KEY-----'].join('') });
    const snapshot = createSnapshot('fixture', [file('src/a.ts', content)]);
    const first = scan(snapshot); expect(JSON.stringify(first)).toEqual(JSON.stringify(scan(snapshot)));
    const result = first.results.find(item => item.rule_id === 'secrets.provider_key' && item.concern)!;
    expect(result.message).toBe(marker); expect(result.evidence[0]?.excerpt).toBe(marker);
    expect(JSON.stringify(first)).not.toContain(body.slice(0, 6));
  });
});

describe('ordered RLS semantics', () => {
  const tableRule = 'rls.table_rls_not_enabled'; const policyRule = 'rls.literal_true_write_policy';
  const migration = (text: string, name = '001.sql'): SnapshotFile => file('supabase/migrations/' + name, text);
  it('preserves semicolons in strings, nested comments and dollar bodies', () => {
    const statements = tokenizeSql("select ';'; /* outer /* ; */ inner */ DO $$ begin perform ';'; end $$; create table t(id int);");
    expect(statements).toHaveLength(3); expect(statements.every(statement => !statement.invalid)).toBe(true);
    expect(tokenizeSql('create table t(id int;')[0]?.invalid).toBe(true);
  });
  it('does not credit neighbouring tables or log/blog substrings', () => {
    const results = evaluate([migration('create table public.orders(id uuid); alter table public.orders enable row level security; create table public.payments(id uuid); create table log(id int); create table blog(id int); alter table blog enable row level security;')], tableRule);
    expect(results.filter(result => result.concern).map(result => result.subject)).toEqual(['table:public.payments', 'table:public.log']);
  });
  it('folds quoted identifiers and applies later enable/disable/drop/recreate operations', () => {
    const results = evaluate([migration('create table "public"."Orders"(id uuid); create table log(id int);', '001.sql'),
      migration('alter table "public"."Orders" enable row level security; alter table log enable row level security; alter table log disable row level security; drop table log; create table log(id int);', '002.sql')], tableRule);
    expect(results.find(result => result.subject === 'table:public.Orders')?.state).toBe('present');
    expect(results.find(result => result.subject === 'table:public.log')?.state).toBe('flagged');
  });
  it('ignores comments, non-public tables and dropped tables', () => {
    const results = evaluate([migration('create table t(id int); -- alter table t enable row level security\ncreate table private.x(id int); create table removed(id int); drop table removed;')], tableRule);
    expect(results.filter(result => result.concern).map(result => result.subject)).toEqual(['table:public.t']);
  });
  it('returns table and root unknown for skipped migrations, even with no tracked tables', () => {
    const skipped: SnapshotFile = { path: 'supabase/migrations/002.sql', size: 1, kind: 'sql', skipped: 'unreadable' };
    const results = evaluate([migration('create table t(id int);'), skipped], tableRule);
    expect(results.map(result => [result.subject, result.state, result.reason])).toEqual([['table:public.t', 'unknown', 'migration_skipped'], ['root', 'unknown', 'migration_skipped']]);
    expect(evaluate([skipped], tableRule)[0]?.state).toBe('unknown');
  });
  it.each(['DO $$ begin null; end $$;', "EXECUTE 'alter table t enable row level security';", 'alter table t rename to other;', 'alter table t set schema private;', 'not valid sql;', 'alter table t enable row level;'])(
    'propagates unresolved migration effects: %s', unresolved => {
      const results = evaluate([migration('create table t(id int); ' + unresolved)], tableRule);
      expect(results.some(result => result.state === 'unknown' && result.subject === 'root')).toBe(true);
      expect(results.find(result => result.subject === 'table:public.t')?.state).toBe('unknown');
    });
  it('finds ALL/INSERT true policies and excludes SELECT, service-role and restrictive decoys', () => {
    const sql = 'create table t(id int); create policy p on t for all using (((true))); create policy ins on t for insert with check (true); create policy sel on t for select using(true); create policy srv on t for update to service_role using(true); create policy rest on t as restrictive for all using(true); create policy expr on t for update using(auth.uid() = id);';
    expect(evaluate([migration(sql)], policyRule).filter(result => result.concern).map(result => result.subject)).toEqual(['policy:public.t.p', 'policy:public.t.ins']);
  });
});
