import type { RepoSnapshot } from '../../src/core/types.ts';
import { lineMatches } from './common.ts';
export function serviceRoleJwt(snapshot: RepoSnapshot) { return lineMatches(snapshot, 'secrets.service_role_jwt', /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+/g); }
