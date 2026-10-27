import type { Rule } from '../../types.ts';
import { rootPackage, summary, testScript } from './support.ts';

// rule tests.no_test_script
export const noTestScriptRule: Rule = { id: 'tests.no_test_script', evaluate(snapshot) {
  const pkg = rootPackage(snapshot);
  const reason = !snapshot.scope.inventory_complete ? 'inventory_incomplete' : pkg.reason;
  const found = pkg.value ? !!testScript(pkg.value) : false;
  return [summary(snapshot, this.id, reason ? null : found,
    reason ? 'Root test script could not be determined.' : found ? 'A non-placeholder root test script is present.' :
      'No non-placeholder scripts.test found in the scanned root package.json.',
    'test:unit without test is reported absent; monorepo packages are outside the root-package check.',
    file => file.path === 'package.json', ['package.json'], reason)];
} };
