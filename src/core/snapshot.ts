import type { FileKind, RepoSnapshot, SnapshotFile } from './types.ts';
import { deniedFolder, emptyScope, LIMITS, normalizePath } from './scope.ts';
import { toSafe } from './safe.ts';

export function isEnvPath(path: string): boolean { return /^\.env(?:\..*)?$/i.test(normalizePath(path).split('/').pop() ?? ''); }
export function isTemplateEnv(path: string): boolean { return /^\.env\.(?:example|sample|template)$/i.test(normalizePath(path).split('/').pop() ?? ''); }
export function classifyPath(path: string): FileKind {
  if (isEnvPath(path)) return 'env';
  if (/\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i.test(path)) return 'source';
  if (/\.json$/i.test(path)) return 'json';
  if (/\.sql$/i.test(path)) return 'sql';
  if (/\.ya?ml$/i.test(path)) return 'yaml';
  if (/\.(?:md|markdown)$/i.test(path)) return 'markdown';
  return 'other';
}
export const defaultLimits = LIMITS;

/** Synthetic/in-memory adapter. Disk adapters apply the same fixed boundaries before reading bytes. */
export function createSnapshot(rootLabel: string, entries: readonly SnapshotFile[]): RepoSnapshot {
  const scope = emptyScope(rootLabel); const files: SnapshotFile[] = []; let totalBytes = 0;
  const seen = new Set<string>();
  const bump = (reason: string, path: string): void => {
    const count = scope.skipped.find(item => item.reason === reason);
    if (count) count.count += 1; else scope.skipped.push({ reason, count: 1 });
    if (scope.skipped_paths.length < LIMITS.max_files) scope.skipped_paths.push({ path: toSafe(path), reason });
    scope.content_complete = false;
  };
  for (const input of [...entries].sort((a, b) => normalizePath(a.path) < normalizePath(b.path) ? -1 : normalizePath(a.path) > normalizePath(b.path) ? 1 : 0)) {
    const path = normalizePath(input.path);
    const folder = deniedFolder(path); const suffix = /\.(pem|key|p12)$/i.exec(path)?.[1];
    if (folder || suffix) {
      const pattern = folder?.toLowerCase() ?? `*.${suffix?.toLowerCase()}`;
      const denied = scope.denied.find(item => item.pattern === pattern);
      if (denied) denied.count += 1; else scope.denied.push({ pattern, count: 1 });
      continue;
    }
    if (scope.files_seen >= LIMITS.max_files) { scope.inventory_complete = false; scope.content_complete = false; break; }
    scope.files_seen += 1;
    let reason = input.skipped;
    if (path.length > 1_024) reason = 'path_too_long';
    else if (/^(?:\/|[A-Za-z]:)/.test(path) || path.split('/').some(segment => segment === '..' || segment === '.' || segment === '')) reason = 'unsafe_path';
    else if (seen.has(path.toLowerCase())) reason = 'case_folded_duplicate';
    seen.add(path.toLowerCase());
    const metadataOnly = (isEnvPath(path) && !isTemplateEnv(path)) || input.metadata_only;
    const kind = classifyPath(path);
    if (!reason && !metadataOnly && kind !== 'other') {
      if (input.size > LIMITS.max_file_bytes) reason = 'file_size_limit';
      else if (totalBytes + input.size > LIMITS.max_total_bytes) reason = 'total_size_limit';
      else if (input.content === undefined) reason = 'unreadable';
      else if (input.content.slice(0, 8_192).includes('\0')) reason = 'binary';
    }
    const file: SnapshotFile = { path, size: input.size, kind };
    if (reason) {
      file.skipped = reason; bump(reason, path);
      if (kind === 'other' || ['symlink', 'reparse_point', 'unreadable_directory', 'path_too_long', 'unsafe_path'].includes(reason)) scope.inventory_complete = false;
    }
    else if (metadataOnly || kind === 'other') { file.metadata_only = true; scope.metadata_only += 1; }
    else { file.content = input.content; totalBytes += input.size; scope.files_read += 1; }
    files.push(file);
  }
  return { root_label: scope.root_label, files, scope };
}
