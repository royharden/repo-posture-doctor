import type { Rule } from '../../types.ts';
import { isTestPath } from '../../scope.ts';
import { summary } from './support.ts';

export const TEST_GLOBS = ['**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}', '**/__tests__/**/*.{ts,tsx,js,jsx}',
  '{e2e,tests,test,cypress,playwright}/**/*.{ts,tsx,js,jsx}'];
// rule tests.no_test_files
export const noTestFilesRule: Rule = { id: 'tests.no_test_files', evaluate(snapshot) {
  const found = snapshot.files.some(file => isTestPath(file.path));
  const lost = !snapshot.scope.inventory_complete || snapshot.files.some(file => file.skipped &&
    ['unreadable_directory', 'symlink', 'junction', 'reparse_point'].includes(file.skipped));
  return [summary(snapshot, this.id, lost ? null : found,
    lost ? 'Test path inventory is incomplete.' : found ? 'Test paths found in the scanned scope.' :
      `no test files found in ${snapshot.scope.files_seen} scanned paths (globs: ${TEST_GLOBS.join(', ')})`,
    'Tests may assert nothing; in-source tests are not recognized.', () => true, TEST_GLOBS,
    lost ? 'inventory_incomplete' : undefined)];
} };
