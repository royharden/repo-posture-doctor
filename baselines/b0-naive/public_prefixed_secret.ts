import type { RepoSnapshot } from '../../src/core/types.ts';
import { lineMatches } from './common.ts';
export function publicPrefixedSecret(snapshot: RepoSnapshot) { return lineMatches(snapshot, 'secrets.public_prefixed_secret', /(?:VITE_|NEXT_PUBLIC_)[A-Z0-9_]*KEY[A-Z0-9_]*/g); }
