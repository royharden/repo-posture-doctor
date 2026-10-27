import { lstat, realpath, readdir, open } from 'node:fs/promises';
import { basename, resolve, relative, isAbsolute, sep } from 'node:path';
import type { RepoSnapshot, SnapshotFile, ScanScope } from '../core/types.ts';
import { toSafe } from '../core/safe.ts';
import { classifyPath } from '../core/snapshot.ts';
import { LIMITS as CORE_LIMITS } from '../core/scope.ts';

export const LIMITS = CORE_LIMITS;
const DENIED = new Set(['.git', 'node_modules', '.thinking', '.chatexports', '.creds']);
const templates = new Set(['.env.example', '.env.sample', '.env.template']);
export class InputRefused extends Error { constructor(reason: string) { super(reason); this.name = 'InputRefused'; } }
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function inside(root: string, target: string): boolean {
  const r = relative(root, target); return r === '' || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`));
}
export const kindFor = classifyPath;
async function checkedDirectory(path: string): Promise<string> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new InputRefused('root_not_plain_directory');
    const actual = await realpath(path);
    // Junctions and name-surrogate reparse points resolve to a different target.
    if (resolve(actual).toLowerCase() !== resolve(path).toLowerCase()) throw new InputRefused('root_redirected');
    return actual;
  } catch (error) { if (error instanceof InputRefused) throw error; throw new InputRefused('root_unreadable'); }
}
export async function validateOutput(root: string, output: string): Promise<string> {
  const target = resolve(output);
  if (inside(root, target)) throw new InputRefused('output_inside_root');
  try { await lstat(target); throw new InputRefused('output_exists'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new InputRefused('output_invalid'); }
  // Require an existing, unredirected parent: no implicit creation through symlinks/junctions.
  const parent = resolve(target, '..');
  try {
    const actual = await realpath(parent);
    if (actual.toLowerCase() !== parent.toLowerCase() || inside(root, actual)) throw new InputRefused('output_redirected');
    if (!(await lstat(parent)).isDirectory()) throw new InputRefused('output_invalid');
  } catch { throw new InputRefused('output_parent_invalid'); }
  return target;
}
export async function walk(rootInput: string): Promise<RepoSnapshot> {
  const root = await checkedDirectory(resolve(rootInput));
  const scope: ScanScope = { root_label: toSafe(basename(root)), files_seen: 0, files_read: 0, metadata_only: 0,
    skipped: [], skipped_paths: [], denied: [], inventory_complete: true, content_complete: true, limits: { ...LIMITS } };
  const files: SnapshotFile[] = [];
  const count = (list: { reason: string; count: number }[], reason: string) => {
    const item = list.find(x => x.reason === reason); if (item) item.count++; else list.push({ reason, count: 1 });
  };
  const deny = (pattern: string) => { const item = scope.denied.find(x => x.pattern === pattern); if (item) item.count++; else scope.denied.push({ pattern, count: 1 }); };
  const skip = (path: string, reason: string, size = 0,
    inventoryUncertain = ['symlink','reparse_point','unreadable_directory','path_too_long','traversal','not_regular_file','case_duplicate','unreadable'].includes(reason)) => {
    scope.content_complete = false; count(scope.skipped, reason);
    if (inventoryUncertain) scope.inventory_complete = false;
    if (scope.skipped_paths.length < LIMITS.max_files) scope.skipped_paths.push({ path: toSafe(path), reason });
    files.push({ path, size, kind: kindFor(path), skipped: reason });
  };
  const queue = (await readdir(root)).map(name => name);
  const folded = new Set<string>(); let total = 0;
  while (queue.length) {
    queue.sort(cmp); const path = queue.shift()!;
    const name = path.split('/').at(-1)!; const lower = name.toLowerCase();
    if (DENIED.has(lower)) { deny(lower); continue; }
    if (/\.(?:pem|key|p12)$/i.test(name)) { deny('*.pem|*.key|*.p12'); continue; }
    const absolute = resolve(root, ...path.split('/'));
    if (!inside(root, absolute)) { skip(path, 'traversal'); continue; }
    if (path.length > 1024) { skip(path, 'path_too_long'); continue; }
    const key = path.toLowerCase();
    if (folded.has(key)) { skip(path, 'case_duplicate'); continue; } folded.add(key);
    // Until a regular file is established, a failure may hide an entire subtree.
    let regularFileSize: number | undefined;
    try {
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) { skip(path, 'symlink'); continue; }
      const actual = await realpath(absolute);
      if (!inside(root, actual) || actual.toLowerCase() !== absolute.toLowerCase()) { skip(path, 'reparse_point'); continue; }
      if (info.isDirectory()) {
        try { queue.push(...(await readdir(absolute)).map(child => `${path}/${child}`)); }
        catch { skip(path, 'unreadable_directory'); scope.inventory_complete = false; }
        continue;
      }
      if (!info.isFile()) { skip(path, 'not_regular_file'); continue; }
      regularFileSize = info.size;
      if (scope.files_seen >= LIMITS.max_files) { scope.inventory_complete = false; scope.content_complete = false; count(scope.skipped, 'file_cap'); break; }
      scope.files_seen++;
      const kind = kindFor(path);
      if ((lower === '.env' || lower.startsWith('.env.')) && !templates.has(lower)) {
        scope.metadata_only++; files.push({ path, size: info.size, kind: 'env', metadata_only: true }); continue;
      }
      if (kind === 'other') { scope.metadata_only++; files.push({ path, size: info.size, kind, metadata_only: true }); continue; }
      if (info.size > LIMITS.max_file_bytes) { skip(path, 'file_bytes_cap', info.size); continue; }
      if (total + info.size > LIMITS.max_total_bytes) { skip(path, 'total_bytes_cap', info.size); continue; }
      // A quiescent folder is required; compare opened identity before and after reading.
      const handle = await open(absolute, 'r');
      try {
        const before = await handle.stat();
        if (!before.isFile() || before.dev !== info.dev || before.ino !== info.ino || before.size !== info.size) { skip(path, 'changed_during_scan', info.size); continue; }
        const buffer = Buffer.alloc(info.size + 1); let bytes = 0;
        while (bytes < buffer.length) { const read = await handle.read(buffer, bytes, buffer.length - bytes, bytes); if (!read.bytesRead) break; bytes += read.bytesRead; }
        const after = await handle.stat();
        if (bytes !== info.size || after.size !== info.size || after.mtimeMs !== before.mtimeMs) { skip(path, 'changed_during_scan', info.size); continue; }
        if (buffer.subarray(0, Math.min(bytes, 8192)).includes(0)) { skip(path, 'binary', info.size); continue; }
        total += bytes; scope.files_read++;
        files.push({ path, size: info.size, kind, content: buffer.subarray(0, bytes).toString('utf8') });
      } finally { await handle.close(); }
    } catch { skip(path, 'unreadable', regularFileSize ?? 0, regularFileSize === undefined); }
  }
  scope.skipped.sort((a,b)=>cmp(a.reason,b.reason)); scope.denied.sort((a,b)=>cmp(a.pattern,b.pattern));
  return { root_label: scope.root_label, files, scope };
}
