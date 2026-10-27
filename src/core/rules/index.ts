import type { Rule } from '../types.ts';
import { providerKey, serviceRoleJwt, secretAssignment, envFilePresent, publicPrefixedSecret } from './secrets/index.ts';
import { tableRlsNotEnabled } from './rls/table_rls_not_enabled.ts';
import { literalTrueWritePolicy } from './rls/literal_true_write_policy.ts';

import { noTestFilesRule } from './tests/noTestFiles.ts';
import { noTestScriptRule } from './tests/noTestScript.ts';
import { runnerNotInCiRule } from './tests/runnerNotInCi.ts';
import { emptyCatchRule } from './obs/emptyCatch.ts';
import { noLoggingLibraryRule } from './obs/noLoggingLibrary.ts';

export const rules: Rule[] = [providerKey, serviceRoleJwt, secretAssignment, envFilePresent, publicPrefixedSecret,
  tableRlsNotEnabled, literalTrueWritePolicy, noTestFilesRule, noTestScriptRule, runnerNotInCiRule, emptyCatchRule, noLoggingLibraryRule];
