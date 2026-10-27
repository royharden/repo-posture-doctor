import type { RepoSnapshot } from '../../src/core/types.ts';
import { repoResult } from './common.ts';
export function noTestFiles(snapshot: RepoSnapshot) { return repoResult('tests.no_test_files', !snapshot.files.some(file => /test/.test(file.path))); }
