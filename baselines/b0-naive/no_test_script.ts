import type { RepoSnapshot } from '../../src/core/types.ts';
import { repoResult } from './common.ts';
export function noTestScript(snapshot: RepoSnapshot) { return repoResult('tests.no_test_script', !snapshot.files.some(file => file.path === 'package.json' && /"test"/.test(file.content ?? ''))); }
