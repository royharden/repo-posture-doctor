import { lstat, readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toSafe } from '../src/core/safe.ts';

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const patterns = [
  /(?<![A-Za-z0-9_-])sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g,
  /(?<![A-Za-z0-9_-])[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /AKIA[0-9A-Z]{16}/g, /gh[pousr]_[A-Za-z0-9]{30,}/g, /github_pat_[A-Za-z0-9_]{30,}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g, /AIza[0-9A-Za-z_-]{35}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:(?:\\\\r\\\\n|\\\\n|\\r\\n|\\n|\\r)|\s)*[A-Za-z0-9+/=]{16,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/g,
];
const excludedDirectories = new Set(['.git', 'node_modules', '.thinking', '.chatexports', '.creds', '.ssh', '.agent-work', '.out', 'dist', 'dist-cli']);
const credentialNames = new Set(['auth.json', '.credentials.json', 'credentials.json', 'token.json', 'tokens.json', 'key.json', 'keys.json', 'id_rsa', 'id_ed25519']);
export interface SweepResult { scanned: string[]; excluded: string[]; violations: { path: string; line: number }[] }
export async function checkNoSecretLiterals(): Promise<SweepResult> {
  const result: SweepResult = { scanned: [], excluded: [], violations: [] };
  let allowances: { file: string; line: number; reason: string }[] = [];
  try {
    const allowancePath = join(productRoot, 'config/secret-sweep-allow.json');
    if ((await lstat(allowancePath)).isSymbolicLink()) throw new Error('invalid_sweep_allowance');
    const parsed: unknown = JSON.parse(await readFile(allowancePath, 'utf8'));
    if (!Array.isArray(parsed) || parsed.some(entry => !entry || typeof entry !== 'object' || typeof entry.file !== 'string' || !Number.isInteger(entry.line) || typeof entry.reason !== 'string' || !entry.reason.trim())) throw new Error('invalid_sweep_allowance');
    allowances = parsed;
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw new Error('invalid_sweep_allowance');
  }
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const absolute = join(directory, entry.name); const path = relative(productRoot, absolute).replace(/\\/g, '/');
      const stat = await lstat(absolute); const name = entry.name.toLowerCase();
      if (stat.isSymbolicLink() || (stat.isDirectory() && excludedDirectories.has(name)) || /^\.env(?:\..*)?$/i.test(name) || credentialNames.has(name) || /\.(?:pem|key|p12)$/i.test(name)) { result.excluded.push(toSafe(path)); continue; }
      if (stat.isDirectory()) { await walk(absolute); continue; }
      if (!stat.isFile()) { result.excluded.push(toSafe(path)); continue; }
      if (stat.size > 8 * 1024 * 1024) throw new Error('sweep_file_too_large');
      const bytes = await readFile(absolute);
      if (bytes.subarray(0, 8192).includes(0)) { result.excluded.push(toSafe(path)); continue; }
      const text = bytes.toString('utf8'); result.scanned.push(toSafe(path));
      for (const pattern of patterns) for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split('\n').length;
        if (!allowances.some(item => item.file === path && item.line === line)) result.violations.push({ path: toSafe(path), line });
      }
    }
  }
  await walk(productRoot); return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkNoSecretLiterals().then(result => { console.log(JSON.stringify(result, null, 2)); if (result.violations.length) process.exitCode = 1; })
    .catch(() => { console.error('secret_literal_sweep_failed'); process.exitCode = 2; });
}
