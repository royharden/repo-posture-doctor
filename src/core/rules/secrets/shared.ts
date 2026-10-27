import type { Candidate } from '../../safe.ts';
import type { RuleConfig, SnapshotFile } from '../../types.ts';
import { shannonEntropy } from '../../../shared/vendored/entropy.ts';

export function isReadable(file: SnapshotFile): boolean { return file.content !== undefined && !file.skipped && !file.metadata_only; }
export function assignmentFile(file: SnapshotFile): boolean { return ['source', 'json', 'yaml', 'env'].includes(file.kind); }
export function placeholder(value: string, config: RuleConfig): boolean {
  if (!value || /^(.)\1*$/.test(value) || /^[xX]+$/.test(value) || /^<[^>]*>$/.test(value)) return true;
  const lower = value.toLowerCase(); return config.placeholders.some(part => lower.includes(part.toLowerCase()));
}
export function providerPositive(candidate: Candidate, config: RuleConfig): boolean {
  return candidate.kind === 'provider' && candidate.prefix !== ['rk', '_test_'].join('') && !placeholder(candidate.value.slice(candidate.prefix.length), config);
}
function sequential(value: string): boolean {
  let run = 1; const points = [...value];
  for (let i = 1; i < points.length; i++) { run = points[i]!.codePointAt(0)! === points[i - 1]!.codePointAt(0)! + 1 ? run + 1 : 1; if (run >= 8) return true; }
  return false;
}
export function assignmentPositive(candidate: Candidate, config: RuleConfig): boolean {
  const value = candidate.value;
  return candidate.kind === 'assignment' && value.length >= 20 && !/\s|\$\{|https?:\/\//i.test(value) &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) &&
    !placeholder(value, config) && !sequential(value) && shannonEntropy(value) >= config.entropy_threshold;
}

/** Bounded base64url decode, independent of browser/Node globals and signature validity. */
export function jwtRole(value: string): string | null {
  const parts = value.split('.'); const payload = parts[1];
  if (parts.length !== 3 || !payload || payload.length > 16_384 || !/^[A-Za-z0-9_-]+={0,2}$/.test(payload) || payload.replace(/=+$/, '').length % 4 === 1) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const input = payload.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let bits = 0; let buffer = 0; const bytes: number[] = [];
  for (const character of input) {
    const n = alphabet.indexOf(character); if (n < 0) return null;
    buffer = (buffer << 6) | n; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 255); buffer &= (1 << bits) - 1; }
  }
  if (buffer !== 0) return null;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    const result: unknown = JSON.parse(decoded);
    return result && typeof result === 'object' && typeof (result as Record<string, unknown>).role === 'string' ? (result as { role: string }).role : null;
  } catch { return null; }
}
