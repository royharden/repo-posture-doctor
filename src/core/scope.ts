import type { Coverage, RepoSnapshot, ScanScope, SnapshotFile } from './types.ts';
import { toSafe } from './safe.ts';

export const LIMITS = { max_files: 2_000, max_file_bytes: 1_048_576, max_total_bytes: 20_971_520 };
export const DENIED_SEGMENTS = ['.git', 'node_modules', '.thinking', '.chatexports', '.creds'];
export function normalizePath(path: string): string { return path.replace(/\\/g, '/'); }
export function deniedFolder(path: string): string | undefined { return normalizePath(path).split('/').find(segment => DENIED_SEGMENTS.includes(segment.toLowerCase())); }
export function isSource(file: SnapshotFile): boolean { return file.kind === 'source'; }
export function isMigration(file: SnapshotFile): boolean { return /^supabase\/migrations\/[^/]+\.sql$/i.test(normalizePath(file.path)); }
export function isTestPath(path: string): boolean {
  const p = normalizePath(path);
  return /(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(p) ||
    /(?:^|\/)__tests__\/(?:.*\/)?[^/]+\.(?:ts|tsx|js|jsx)$/i.test(p) ||
    /^(?:e2e|tests|test|cypress|playwright)\/(?:.*\/)?[^/]+\.(?:ts|tsx|js|jsx)$/i.test(p);
}
export function emptyScope(rootLabel: string): ScanScope {
  return { root_label: toSafe(normalizePath(rootLabel).split('/').pop() ?? ''), files_seen: 0, files_read: 0, metadata_only: 0, skipped: [], skipped_paths: [], denied: [], inventory_complete: true, content_complete: true, limits: { ...LIMITS } };
}
export function coverage(snapshot: RepoSnapshot, predicate: (file: SnapshotFile) => boolean, required: string[]): Coverage {
  const files = snapshot.files.filter(predicate);
  const counts = new Map<string, number>();
  for (const file of files) if (file.skipped) counts.set(file.skipped, (counts.get(file.skipped) ?? 0) + 1);
  if (!snapshot.scope.inventory_complete) counts.set('inventory_incomplete', 1);
  return { required, examined: files.filter(file => !file.skipped && (file.content !== undefined || file.metadata_only)).length,
    skipped: [...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([reason, count]) => ({ reason, count })) };
}
