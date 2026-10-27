import type { Rule, RuleDraft } from '../../types.ts';
import { findCandidates } from '../../safe.ts';
import { finding, summarize } from '../common.ts';
import { isReadable, jwtRole } from './shared.ts';

// rule secrets.service_role_jwt
export const serviceRoleJwt: Rule = { id: 'secrets.service_role_jwt', evaluate(snapshot) {
  const results: RuleDraft[] = []; const blind = 'signature and validity are not checked; new sb_secret_ keys are not checked';
  for (const file of snapshot.files.filter(isReadable)) for (const candidate of findCandidates(file.content!)) {
    if (candidate.kind !== 'jwt' || jwtRole(candidate.value) !== 'service_role') continue;
    const result = finding('secrets.service_role_jwt', blind, 'JWT payload role=service_role (signature not checked)', file, candidate.start, candidate.end);
    result.severity_hint = 'high'; results.push(result);
  }
  return summarize(snapshot, results, 'secrets.service_role_jwt', blind, file => file.kind !== 'other' && !file.metadata_only, ['all readable kinds']);
} };
