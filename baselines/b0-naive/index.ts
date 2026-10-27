import type { RepoSnapshot, RuleResult } from '../../src/core/types.ts';
import { sha256 } from '../../src/core/sha256.ts';
import { safeValue } from '../../src/core/report/json.ts';
import { detectedSecretValues } from '../../src/core/rules/secrets/index.ts';
import { DEFAULT_CONFIG } from '../../src/core/config.ts';
import { providerKey } from './provider_key.ts';
import { serviceRoleJwt } from './service_role_jwt.ts';
import { secretAssignment } from './secret_assignment.ts';
import { envFilePresent } from './env_file_present.ts';
import { publicPrefixedSecret } from './public_prefixed_secret.ts';
import { tableRlsNotEnabled } from './table_rls_not_enabled.ts';
import { literalTrueWritePolicy } from './literal_true_write_policy.ts';
import { noTestFiles } from './no_test_files.ts';
import { noTestScript } from './no_test_script.ts';
import { runnerNotInCi } from './runner_not_in_ci.ts';
import { emptyCatch } from './empty_catch.ts';
import { noLoggingLibrary } from './no_logging_library.ts';
import { lineMatches } from './common.ts';

export function runB0(snapshot: RepoSnapshot): RuleResult[] {
  const drafts = [providerKey, serviceRoleJwt, secretAssignment, envFilePresent, publicPrefixedSecret, tableRlsNotEnabled,
    literalTrueWritePolicy, noTestFiles, noTestScript, runnerNotInCi, emptyCatch, noLoggingLibrary].flatMap(rule => rule(snapshot));
  const safe = safeValue(drafts, detectedSecretValues(snapshot, DEFAULT_CONFIG));
  safe.sort((a, b) => a.rule_id < b.rule_id ? -1 : a.rule_id > b.rule_id ? 1 : a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0);
  const counts = new Map<string, number>();
  return safe.map(result => { const key = `${result.rule_id}|${result.subject}`; const count = (counts.get(key) ?? 0) + 1; counts.set(key, count);
    return { ...result, id: sha256(key + (count === 1 ? '' : `|#${count}`)) }; });
}
/** OOS-only keyword floor; intentionally never presented as a calibrated secrets detector. */
export function runB0Oos(snapshot: RepoSnapshot): RuleResult[] {
  const results = safeValue(lineMatches(snapshot, 'secrets.oos_keyword', /(?:secret|token|key|password)\w*\s*[:=]\s*['"][^'"]{8,}['"]/gi), detectedSecretValues(snapshot, DEFAULT_CONFIG));
  return results.map((result, index) => ({ ...result, id: sha256(`${result.rule_id}|${result.subject}|${index}`) }));
}
