import type { Rule } from '../../types.ts';
import { rootPackage, summary, testScript } from './support.ts';
import { parseWorkflow } from './workflow.ts';

export function invokesTest(command: string, scripts: Record<string, unknown>, seen = new Set<string>()): boolean {
  if (/(?:^|[\s;&|])(?:npm\s+(?:run\s+)?test|pnpm\s+test|yarn\s+test|npx\s+(?:vitest|jest))(?:\s|$|[;&|])/.test(command)) return true;
  for (const match of command.matchAll(/(?:^|[\s;&|])npm\s+run\s+([\w:.-]+)/g)) {
    const name = match[1]; if (seen.has(name)) continue;
    const next = scripts[name]; if (typeof next !== 'string') continue;
    const visited = new Set(seen); visited.add(name);
    if (invokesTest(next, scripts, visited)) return true;
  }
  return false;
}

// rule tests.runner_not_in_ci
export const runnerNotInCiRule: Rule = { id: 'tests.runner_not_in_ci', evaluate(snapshot) {
  const predicate = (file: { path: string }) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file.path);
  const files = snapshot.files.filter(predicate); const pkg = rootPackage(snapshot);
  let reason = !snapshot.scope.inventory_complete ? 'inventory_incomplete' : pkg.reason;
  if (!reason && (!pkg.value || !testScript(pkg.value))) reason = 'test_script_unavailable';
  if (!reason && !files.length) reason = 'missing_workflows';
  const workflows = files.map(file => file.skipped || file.content === undefined ? null : parseWorkflow(file.content));
  if (!reason && workflows.some(value => value === null)) reason = 'invalid_or_unreadable_workflow';
  if (!reason && workflows.some(value => value?.reusable)) reason = 'reusable_workflow';
  const scripts = (pkg.value?.scripts ?? {}) as Record<string, unknown>;
  const found = workflows.some(value => value?.runs.some(run => invokesTest(run, scripts)));
  return [summary(snapshot, this.id, reason ? null : found,
    reason ? 'GitHub Actions test execution could not be determined.' : found ? 'A recognized test command is present in GitHub Actions.' :
      'No recognized test command found in the examined GitHub Actions workflows.',
    'CI outside GitHub Actions and unsupported YAML constructs are not resolved.', predicate,
    ['package.json', '.github/workflows/*.{yml,yaml}'], reason)];
} };
