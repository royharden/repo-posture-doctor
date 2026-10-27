import type { Span } from './types.ts';

export interface Candidate {
  kind: 'provider' | 'jwt' | 'pem' | 'assignment'; start: number; end: number;
  value: string; prefix: string; name?: string; marker?: string;
}

function jwtRole(value: string): string | undefined {
  const encoded = value.split('.')[1]?.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!encoded || encoded.length > 16_384) return undefined;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = []; let bits = 0; let accumulator = 0;
  for (const char of encoded) {
    const digit = alphabet.indexOf(char); if (digit < 0) return undefined;
    accumulator = (accumulator << 6) | digit; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((accumulator >>> bits) & 255); }
  }
  try {
    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)));
    return payload && typeof payload === 'object' && 'role' in payload && typeof payload.role === 'string' ? payload.role : undefined;
  } catch { return undefined; }
}

/** Name tokens, rather than substring matches, keep tokenizer/keyboard out. */
export function isSecretName(name: string): boolean {
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_.-]+/);
  return words.some(word => ['secret', 'token', 'password', 'passwd', 'apikey', 'privatekey'].includes(word)) ||
    words.some((word, i) => (word === 'api' || word === 'private') && words[i + 1] === 'key');
}

/** Candidate superset is shared by rule filtering and masking; it is not itself the detection set. */
export function findCandidates(text: string): Candidate[] {
  const found: Candidate[] = [];
  const provider = /(?<![A-Za-z0-9_-])(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|sk-(?!ant-|proj-)[A-Za-z0-9_-]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}(?![0-9A-Z])|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-]))/g;
  const prefixes = ['sk-ant-', 'sk-proj-', 'github_pat_', 'sk_live_', 'rk_live_', 'sk_test_', 'rk_test_', 'ghp_', 'gho_', 'ghs_', 'ghu_', 'ghr_', 'AKIA', 'AIza', 'sk-'];
  for (const match of text.matchAll(provider)) {
    const value = match[0];
    const prefix = prefixes.find(item => value.startsWith(item)) ?? value.slice(0, 5);
    found.push({ kind: 'provider', start: match.index, end: match.index + value.length, value, prefix });
  }
  for (const match of text.matchAll(/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+={0,2}\.eyJ[A-Za-z0-9_-]+={0,2}\.[A-Za-z0-9_-]+={0,2}/g)) {
    found.push({ kind: 'jwt', start: match.index, end: match.index + match[0].length, value: match[0], prefix: 'eyJ' });
  }
  const pem = /(?<!-)-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g;
  for (const match of text.matchAll(pem)) {
    const start = match.index;
    const marker = match[0];
    const tail = text.slice(start + marker.length);
    const endMarker = /-----END (?:[A-Z]+ )*PRIVATE KEY-----/.exec(tail);
    // Without END, accept only contiguous base64 material and its real/escaped line separators.
    const material = /^(?:(?:\\\\r\\\\n|\\\\n|\\r\\n|\\n|\\r)|\s|[A-Za-z0-9+/=])*/.exec(tail)?.[0] ?? '';
    const end = start + marker.length + (endMarker ? endMarker.index + endMarker[0].length : material.length);
    found.push({ kind: 'pem', start, end, value: text.slice(start, end), prefix: '', marker });
  }
  const assignment = /(?<![\w$.-])(?:["']?)([A-Za-z_$][\w$.-]*)(?:["']?)\s*(?:=|:)\s*(["'`])((?:\\.|(?!\2)[^\\\r\n])*)\2/g;
  for (const match of text.matchAll(assignment)) {
    if (!isSecretName(match[1]) || match[3].length < 20 || (match[2] === '`' && match[3].includes('${'))) continue;
    const relative = match[0].length - match[3].length - 1;
    const start = match.index + relative;
    found.push({ kind: 'assignment', start, end: start + match[3].length, value: match[3], prefix: '', name: match[1] });
  }
  // Unquoted YAML/env scalar; quote-prefixed values are handled above, never as raw scalar tails.
  for (const match of text.matchAll(/(?:^|\n)[ \t]*([A-Za-z_$][\w$.-]*)\s*(?:=|:)\s*([^\s"'`][^\r\n]*)/g)) {
    if (!isSecretName(match[1])) continue;
    const value = match[2].trimEnd();
    if (value.length < 20) continue;
    const start = match.index + match[0].lastIndexOf(match[2]);
    found.push({ kind: 'assignment', start, end: start + value.length, value, prefix: '', name: match[1] });
  }
  return found.sort((a, b) => a.start - b.start || b.end - a.end || (a.kind === 'provider' ? -1 : b.kind === 'provider' ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

export function maskCandidate(candidate: Candidate): string {
  if (candidate.kind === 'pem') return candidate.marker ?? '[redacted]';
  if (candidate.kind === 'assignment') return `[redacted ${candidate.value.length} chars]`;
  const count = candidate.value.length - candidate.prefix.length;
  return `${candidate.prefix}…[redacted ${count} chars]${candidate.kind === 'jwt' ? jwtRole(candidate.value) === 'service_role' ? ' (payload role=service_role)' : ' (JWT payload masked)' : ''}`;
}

interface Replacement { start: number; end: number; text: string }
function replacements(text: string, detectedValues: readonly string[]): Replacement[] {
  const spans: Replacement[] = findCandidates(text).map(candidate => ({ start: candidate.start, end: candidate.end,
    text: candidate.kind === 'pem' && candidate.value.length > (candidate.marker?.length ?? 0) ? `${candidate.marker}…[redacted]` : maskCandidate(candidate) }));
  for (const value of detectedValues) {
    if (!value) continue;
    let position = 0;
    while ((position = text.indexOf(value, position)) !== -1) {
      const candidate = findCandidates(value).find(item => item.start === 0 && item.end === value.length);
      spans.push({ start: position, end: position + value.length, text: candidate ? maskCandidate(candidate) : `[redacted ${value.length} chars]` });
      position += value.length;
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Replacement[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && span.start < previous.end) {
      if (span.end > previous.end) { previous.end = span.end; previous.text = '[redacted overlapping values]'; }
    } else merged.push({ ...span });
  }
  return merged;
}

function escapeControls(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, char => `\\u{${char.charCodeAt(0).toString(16)}}`);
}

/** The single outbound-string boundary. It has no I/O and retains no secret state. */
export function toSafe(text: string, detectedValues: readonly string[] = []): string {
  let result = ''; let offset = 0;
  for (const span of replacements(text, detectedValues)) { result += text.slice(offset, span.start) + span.text; offset = span.end; }
  return escapeControls(result + text.slice(offset));
}

/** Mask the complete line first, then choose a window without bisecting replacement tokens. */
export function safeExcerpt(content: string, start: number, end: number, detectedValues: readonly string[] = []): string {
  const pem = findCandidates(content).find(candidate => candidate.kind === 'pem' && candidate.start === start);
  if (pem) return escapeControls(pem.marker ?? '[redacted]');
  const lineStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextBreak = content.indexOf('\n', start);
  const lineEnd = nextBreak === -1 ? content.length : nextBreak;
  // Full-content matching also catches a PEM block that started on an earlier line.
  const spans = replacements(content, detectedValues).filter(span => span.end > lineStart && span.start < lineEnd)
    .map(span => ({ ...span, start: Math.max(lineStart, span.start), end: Math.min(lineEnd, span.end) }));
  const chunks: { start: number; end: number; outputStart: number; outputEnd: number; replacement: boolean }[] = [];
  let masked = ''; let cursor = lineStart;
  for (const span of spans) {
    if (span.start > cursor) { const outputStart = masked.length; masked += content.slice(cursor, span.start); chunks.push({ start: cursor, end: span.start, outputStart, outputEnd: masked.length, replacement: false }); }
    const outputStart = masked.length; masked += span.text;
    chunks.push({ start: span.start, end: span.end, outputStart, outputEnd: masked.length, replacement: true }); cursor = span.end;
  }
  if (cursor < lineEnd) { const outputStart = masked.length; masked += content.slice(cursor, lineEnd); chunks.push({ start: cursor, end: lineEnd, outputStart, outputEnd: masked.length, replacement: false }); }
  const mapOffset = (offset: number, last: boolean): number => {
    const chunk = chunks.find(item => offset >= item.start && offset < item.end);
    return chunk ? chunk.replacement ? (last ? chunk.outputEnd : chunk.outputStart) : chunk.outputStart + offset - chunk.start : masked.length;
  };
  let from = Math.max(0, mapOffset(start, false) - 40);
  let to = Math.min(masked.length, mapOffset(Math.max(start, Math.min(end - 1, lineEnd - 1)), true) + 40);
  for (const chunk of chunks) if (chunk.replacement) {
    if (from > chunk.outputStart && from < chunk.outputEnd) from = chunk.outputStart;
    if (to > chunk.outputStart && to < chunk.outputEnd) to = chunk.outputEnd;
  }
  return escapeControls(masked.slice(from, to).replace(/\r$/, ''));
}

export function spanAt(text: string, start: number, end: number): Span {
  const position = (offset: number): { line: number; col: number } => {
    const before = text.slice(0, Math.max(0, offset));
    return { line: before.split('\n').length, col: before.length - before.lastIndexOf('\n') };
  };
  const first = position(start); const last = position(Math.max(start, end - 1));
  return { startLine: first.line, startCol: first.col, endLine: last.line, endCol: last.col };
}
