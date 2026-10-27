import type { RepoSnapshot } from '../../src/core/types.ts';
import { repoResult } from './common.ts';
export function runnerNotInCi(snapshot: RepoSnapshot) { return repoResult('tests.runner_not_in_ci', !snapshot.files.some(file => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file.path) && /test/.test(file.content ?? ''))); }
