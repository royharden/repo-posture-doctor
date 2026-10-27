import type { RepoSnapshot } from '../../src/core/types.ts';
import { repoResult } from './common.ts';
export function noLoggingLibrary(snapshot: RepoSnapshot) { return repoResult('obs.no_logging_library', !snapshot.files.some(file => /(?:^|\/)package\.json$/.test(file.path) && /sentry|pino|winston/i.test(file.content ?? ''))); }
