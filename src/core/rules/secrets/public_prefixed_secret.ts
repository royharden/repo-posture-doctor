import type { Rule, RuleDraft } from '../../types.ts';
import { finding, summarize } from '../common.ts';
import { assignmentFile, isReadable } from './shared.ts';

// rule secrets.public_prefixed_secret
export const publicPrefixedSecret: Rule = { id: 'secrets.public_prefixed_secret', evaluate(snapshot) {
  const results: RuleDraft[] = []; const blind = 'neutral names; names defined only in non-template env bodies';
  for (const file of snapshot.files.filter(file => isReadable(file) && assignmentFile(file))) {
    const text = file.content!;
    for (const match of text.matchAll(/\b(?:VITE_|NEXT_PUBLIC_|REACT_APP_|PUBLIC_)[A-Z0-9_]+\b/g)) {
      if (!/SECRET|SERVICE_ROLE|PRIVATE|PASSWORD/.test(match[0])) continue;
      const start = match.index; const before = text.slice(Math.max(0, start - 20), start); const after = text.slice(start + match[0].length);
      const reference = /(?:import\.meta\.env\.|process\.env\.)$/.test(before);
      const definition = /^['"]?\s*[:=]/.test(after);
      if (!reference && !definition) continue;
      results.push(finding('secrets.public_prefixed_secret', blind, 'public-prefixed sensitive variable name present', file, start, start + match[0].length));
    }
  }
  return summarize(snapshot, results, 'secrets.public_prefixed_secret', blind, assignmentFile, ['TS/JS', 'JSON', 'YAML', 'env templates']);
} };
