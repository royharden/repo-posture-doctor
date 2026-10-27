import type { Rule } from '../types.ts';
import { providerKey, serviceRoleJwt, secretAssignment, envFilePresent, publicPrefixedSecret } from './secrets/index.ts';
import { tableRlsNotEnabled } from './rls/table_rls_not_enabled.ts';
import { literalTrueWritePolicy } from './rls/literal_true_write_policy.ts';

export const rules: Rule[] = [providerKey, serviceRoleJwt, secretAssignment, envFilePresent, publicPrefixedSecret,
  tableRlsNotEnabled, literalTrueWritePolicy];
