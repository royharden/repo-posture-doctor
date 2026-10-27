import type { Rule, RuleDraft } from '../../types.ts';
import { findCandidates } from '../../safe.ts';
import { isTestPath } from '../../scope.ts';
import { finding, summarize } from '../common.ts';
import { isReadable, providerPositive } from './shared.ts';

// rule secrets.provider_key
export const providerKey: Rule = { id: 'secrets.provider_key', evaluate(snapshot, config) {
  const results: RuleDraft[] = []; const blind = 'concatenated or encoded keys; unlisted formats; validity is not checked';
  for (const file of snapshot.files.filter(isReadable)) for (const candidate of findCandidates(file.content!)) {
    if (candidate.kind !== 'provider' && candidate.kind !== 'pem') continue;
    if (candidate.kind === 'provider' && !providerPositive(candidate, config)) continue;
    const pem = candidate.kind === 'pem'; const marker = candidate.marker ?? '';
    const result = finding('secrets.provider_key', blind, pem ? marker : 'provider-format token present', file,
      candidate.start, pem ? candidate.start + marker.length : candidate.end);
    if (pem && result.evidence[0]) result.evidence[0].excerpt = marker;
    result.severity_hint = isTestPath(file.path) || /(?:^|\/)(?:fixtures?|__fixtures__)\//i.test(file.path) || candidate.prefix === ['sk', '_test_'].join('') ? 'low' : 'high';
    results.push(result);
  }
  return summarize(snapshot, results, 'secrets.provider_key', blind, file => file.kind !== 'other' && !file.metadata_only, ['all readable kinds']);
} };
