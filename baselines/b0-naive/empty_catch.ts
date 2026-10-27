import type { RepoSnapshot } from '../../src/core/types.ts';
import { lineMatches } from './common.ts';
export function emptyCatch(snapshot: RepoSnapshot) { return lineMatches(snapshot, 'obs.empty_catch', /catch\s*(\([^)]*\))?\s*\{\s*\}/g); }
