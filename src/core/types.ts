export type State = 'flagged' | 'present' | 'absent_in_scope' | 'unknown';
export type Family = 'secrets' | 'rls' | 'tests' | 'obs';
export type FileKind = 'source' | 'json' | 'sql' | 'yaml' | 'markdown' | 'env' | 'other';
export interface Span { startLine: number; startCol: number; endLine: number; endCol: number }
export interface Pointer { kind: 'file:line'; path: string; line: number; col: number; endLine: number; endCol: number; excerpt: string }
export interface ReasonCount { reason: string; count: number }
export interface Coverage { required: string[]; examined: number; skipped: ReasonCount[] }
export interface ScanScope {
  root_label: string; files_seen: number; files_read: number; metadata_only: number;
  skipped: ReasonCount[]; skipped_paths: { path: string; reason: string }[];
  denied: { pattern: string; count: number }[]; inventory_complete: boolean; content_complete: boolean;
  limits: { max_files: number; max_file_bytes: number; max_total_bytes: number };
}
export interface SnapshotFile { path: string; size: number; kind: FileKind; content?: string; skipped?: string; metadata_only?: boolean }
export interface RepoSnapshot { case_id?: string; root_label: string; files: SnapshotFile[]; scope: ScanScope }
export interface RuleResult {
  rule_id: string; family: Family; subject: string; state: State; concern: boolean | null;
  severity_hint: 'high' | 'medium' | 'low' | 'info'; evidence: Pointer[]; message: string; blind_spot: string;
  coverage?: Coverage; reason?: string; id: string;
}
export type RuleDraft = Omit<RuleResult, 'id'> & { id?: string };
export interface RuleConfig { entropy_threshold: number; placeholders: string[]; provisional: boolean; to_be_chosen_on: string }
export interface Rule { id: string; evaluate: (snapshot: RepoSnapshot, config: RuleConfig) => RuleDraft[] }
export interface Report {
  schema_version: 1; tool_version: string; rules_version: string; scope: ScanScope;
  results: RuleResult[]; not_checked: { item: string; why: string }[];
}
