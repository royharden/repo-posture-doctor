import type { RepoSnapshot } from '../../src/core/types.ts';
import { lineMatches } from './common.ts';
export function secretAssignment(snapshot: RepoSnapshot) { return lineMatches(snapshot, 'secrets.secret_assignment', /(?:secret|token|key|password)\w*\s*[:=]\s*['"][^'"]{8,}['"]/gi); }
