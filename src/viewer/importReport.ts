import type { Report } from '../core/types.ts';
import { safeValue } from '../core/report/json.ts';

export const MAX_REPORT_BYTES = 5 * 1_024 * 1_024;
export const IMPORT_LIMITS = { results: 5_000, evidence: 100, skipped_paths: 2_000, not_checked: 100, reasons: 100, required: 100, text: 8_192 } as const;
const RULES = ['secrets.provider_key','secrets.service_role_jwt','secrets.secret_assignment','secrets.env_file_present','secrets.public_prefixed_secret','rls.table_rls_not_enabled','rls.literal_true_write_policy','tests.no_test_files','tests.no_test_script','tests.runner_not_in_ci','obs.empty_catch','obs.no_logging_library'];
const fail = (): never => { throw new Error('Report format is invalid or exceeds the supported bounds.'); };
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const item = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(item,key)) || Object.keys(item).some(key => !required.includes(key) && !optional.includes(key))) return fail();
  return item;
}
function string(value: unknown, max: number = IMPORT_LIMITS.text): void { if (typeof value !== 'string' || value.length > max) fail(); }
function number(value: unknown, min = 0): void { if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > Number.MAX_SAFE_INTEGER) fail(); }
function boolean(value: unknown): void { if (typeof value !== 'boolean') fail(); }
function array(value: unknown, cap: number, check: (value: unknown) => void): void { if (!Array.isArray(value) || value.length > cap) fail(); (value as unknown[]).forEach(check); }
function reasons(value: unknown): void { array(value,IMPORT_LIMITS.reasons,value => { const entry=object(value,['reason','count']);string(entry.reason,128);number(entry.count); }); }
function coverage(value: unknown): void { const c=object(value,['required','examined','skipped']);array(c.required,IMPORT_LIMITS.required,value=>string(value,1_024));number(c.examined);reasons(c.skipped); }
function pointer(value: unknown): void {
  const p=object(value,['kind','path','line','col','endLine','endCol','excerpt']);
  if(p.kind!=='file:line')fail();string(p.path,4_096);string(p.excerpt);
  for(const key of ['line','col','endLine','endCol'])number(p[key],1);
  if(Number(p.endLine)<Number(p.line)||p.endLine===p.line&&Number(p.endCol)<Number(p.col))fail();
}
function result(value: unknown): void {
  const r=object(value,['rule_id','family','subject','state','concern','severity_hint','evidence','message','blind_spot','id'],['coverage','reason']);
  if(typeof r.rule_id!=='string'||typeof r.state!=='string'||typeof r.severity_hint!=='string')fail();
  if(!RULES.includes(r.rule_id)||r.family!==r.rule_id.split('.')[0]||!['flagged','present','absent_in_scope','unknown'].includes(r.state)||!['high','medium','low','info'].includes(r.severity_hint))fail();
  if(r.state==='unknown'?r.concern!==null:typeof r.concern!=='boolean')fail();
  if(r.state==='flagged'&&r.concern!==true||r.state==='present'&&r.concern!==false)fail();
  string(r.subject,4_096);string(r.message);string(r.blind_spot);string(r.id,64);
  if(typeof r.id!=='string'||!/^[a-f0-9]{64}$/.test(r.id))fail();
  array(r.evidence,IMPORT_LIMITS.evidence,pointer);
  if(r.coverage!==undefined)coverage(r.coverage);if(r.reason!==undefined)string(r.reason,128);
}

/** JSON is treated as untrusted data, never executable content. Errors never quote imported text. */
export function importReport(text: string, declaredBytes?: number): Report {
  if(text.length>MAX_REPORT_BYTES || declaredBytes!==undefined&&(!Number.isSafeInteger(declaredBytes)||declaredBytes<0||declaredBytes>MAX_REPORT_BYTES) || new TextEncoder().encode(text).length>MAX_REPORT_BYTES) throw new Error('Choose a report.json no larger than 5 MiB.');
  let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new Error('The selected file is not valid JSON.');}
  const r=object(parsed,['schema_version','tool_version','rules_version','scope','results','not_checked']);
  if(r.schema_version!==1)fail();string(r.tool_version,80);string(r.rules_version,80);
  const scope=object(r.scope,['root_label','files_seen','files_read','metadata_only','skipped','skipped_paths','denied','inventory_complete','content_complete','limits']);
  string(scope.root_label,4_096);for(const key of ['files_seen','files_read','metadata_only'])number(scope[key]);
  boolean(scope.inventory_complete);boolean(scope.content_complete);reasons(scope.skipped);
  array(scope.skipped_paths,IMPORT_LIMITS.skipped_paths,value=>{const item=object(value,['path','reason']);string(item.path,4_096);string(item.reason,128);});
  array(scope.denied,100,value=>{const item=object(value,['pattern','count']);string(item.pattern,1_024);number(item.count);});
  const limits=object(scope.limits,['max_files','max_file_bytes','max_total_bytes']);for(const value of Object.values(limits))number(value,1);
  if(Number(scope.files_read)+Number(scope.metadata_only)>Number(scope.files_seen))fail();
  array(r.results,IMPORT_LIMITS.results,result);
  const results=r.results as {id:string;rule_id:string}[];
  if(new Set(results.map(item=>item.id)).size!==results.length||RULES.some(rule=>!results.some(item=>item.rule_id===rule)))fail();
  array(r.not_checked,IMPORT_LIMITS.not_checked,value=>{const item=object(value,['item','why']);string(item.item,1_024);string(item.why);});
  // The normal output boundary masks recognizable values and control characters in arbitrary imported strings.
  return safeValue(parsed) as Report;
}
