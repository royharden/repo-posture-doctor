import type { RepoSnapshot, RuleDraft, SnapshotFile } from '../../types.ts';
import { coverage } from '../../scope.ts';

export function summary(snapshot: RepoSnapshot, id: string, present: boolean | null, message: string,
  blindSpot: string, predicate: (file: SnapshotFile) => boolean, required: string[], reason?: string): RuleDraft {
  return { rule_id: id, family: id.startsWith('tests.') ? 'tests' : 'obs', subject: 'root',
    state: present === null ? 'unknown' : present ? 'present' : 'absent_in_scope',
    concern: present === null ? null : !present, severity_hint: 'info', evidence: [], message, blind_spot: blindSpot,
    coverage: coverage(snapshot, predicate, required), ...(reason ? { reason } : {}) };
}

export function rootPackage(snapshot: RepoSnapshot): { value?: Record<string, unknown>; reason?: string } {
  const file = snapshot.files.find(item => item.path === 'package.json');
  if (!file) return { reason: 'missing_package' };
  if (file.skipped || file.content === undefined) return { reason: file.skipped ?? 'unreadable' };
  try {
    const value: unknown = JSON.parse(file.content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { reason: 'invalid_json' };
    return { value: value as Record<string, unknown> };
  } catch { return { reason: 'invalid_json' }; }
}

export function testScript(pkg: Record<string, unknown>): string | undefined {
  const scripts = pkg.scripts;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return undefined;
  const value = (scripts as Record<string, unknown>).test;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const normalized = value.trim().replace(/'/g, '"');
  return /^echo\s+"Error: no test specified"\s*&&\s*exit\s+1\s*$/.test(normalized) ? undefined : value;
}
