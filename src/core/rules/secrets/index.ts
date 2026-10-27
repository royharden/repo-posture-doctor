import type { RepoSnapshot, RuleConfig } from '../../types.ts';
import { findCandidates } from '../../safe.ts';
import { assignmentFile, assignmentPositive, isReadable, jwtRole, providerPositive } from './shared.ts';
export { providerKey } from './provider_key.ts';
export { serviceRoleJwt } from './service_role_jwt.ts';
export { secretAssignment } from './secret_assignment.ts';
export { envFilePresent } from './env_file_present.ts';
export { publicPrefixedSecret } from './public_prefixed_secret.ts';

/** Internal only: never serialize these values or their hashes. */
export function detectedSecretValues(snapshot: RepoSnapshot, config: RuleConfig): string[] {
  const values: string[] = [];
  for (const file of snapshot.files.filter(isReadable)) for (const candidate of findCandidates(file.content!)) {
    if (candidate.kind === 'pem' || providerPositive(candidate, config) ||
      (candidate.kind === 'jwt' && jwtRole(candidate.value) === 'service_role') ||
      (assignmentFile(file) && assignmentPositive(candidate, config))) values.push(candidate.value);
  }
  return [...new Set(values)];
}
