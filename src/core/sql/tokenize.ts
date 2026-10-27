/** Small, position-preserving PostgreSQL lexer, not an SQL executor. */
export interface SqlToken { value: string; start: number; end: number; kind: 'word' | 'identifier' | 'string' | 'symbol' }
export interface SqlStatement { tokens: SqlToken[]; start: number; end: number; invalid: boolean }

export function tokenizeSql(text: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let tokens: SqlToken[] = [];
  let i = 0;
  let invalid = false;
  const finish = (end: number): void => {
    let depth = 0;
    for (const token of tokens) {
      if (token.kind === 'symbol' && token.value === '(') depth++;
      if (token.kind === 'symbol' && token.value === ')' && --depth < 0) invalid = true;
    }
    if (depth !== 0) invalid = true;
    if (tokens.length || invalid) statements.push({ tokens, start: tokens[0]?.start ?? end, end, invalid });
    tokens = []; invalid = false;
  };
  while (i < text.length) {
    const start = i;
    const ch = text[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (text.startsWith('--', i)) { const end = text.indexOf('\n', i); i = end < 0 ? text.length : end + 1; continue; }
    if (text.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < text.length && depth) {
        if (text.startsWith('/*', i)) { depth++; i += 2; }
        else if (text.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) invalid = true;
      continue;
    }
    if (ch === ';') { i++; finish(i); continue; }
    if (ch === '"' || ch === "'") {
      const quote = ch; let value = ''; let closed = false; i++;
      while (i < text.length) {
        if (text[i] === quote) {
          if (text[i + 1] === quote) { value += quote; i += 2; continue; }
          i++; closed = true; break;
        }
        // E'...' escape sequences cannot terminate a statement either.
        if (quote === "'" && text[i] === '\\' && i + 1 < text.length) { value += text.slice(i, i + 2); i += 2; }
        else value += text[i++]!;
      }
      tokens.push({ value, start, end: i, kind: quote === '"' ? 'identifier' : 'string' });
      if (!closed) invalid = true;
      continue;
    }
    if (ch === '$') {
      const delimiter = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i))?.[0];
      if (delimiter) {
        const close = text.indexOf(delimiter, i + delimiter.length);
        i = close < 0 ? text.length : close + delimiter.length;
        tokens.push({ value: text.slice(start, i), start, end: i, kind: 'string' });
        if (close < 0) invalid = true;
        continue;
      }
    }
    if (/[A-Za-z_]/.test(ch)) {
      i++; while (i < text.length && /[A-Za-z0-9_$]/.test(text[i]!)) i++;
      tokens.push({ value: text.slice(start, i).toLowerCase(), start, end: i, kind: 'word' }); continue;
    }
    i++; tokens.push({ value: ch, start, end: i, kind: 'symbol' });
  }
  finish(text.length);
  return statements;
}

export function keyword(token: SqlToken | undefined, value: string): boolean {
  return token?.kind === 'word' && token.value === value;
}

export function identifierAt(tokens: readonly SqlToken[], at: number): { schema: string; name: string; next: number } | null {
  const first = tokens[at];
  if (!first || (first.kind !== 'word' && first.kind !== 'identifier')) return null;
  if (tokens[at + 1]?.value !== '.') return { schema: 'public', name: first.value, next: at + 1 };
  const second = tokens[at + 2];
  if (!second || (second.kind !== 'word' && second.kind !== 'identifier')) return null;
  return { schema: first.value, name: second.value, next: at + 3 };
}
