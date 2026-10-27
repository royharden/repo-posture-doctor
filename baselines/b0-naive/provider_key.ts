import type { RepoSnapshot } from '../../src/core/types.ts';
import { lineMatches } from './common.ts';
export function providerKey(snapshot: RepoSnapshot) {
  // Deliberately no left boundary and no placeholder filtering.
  return lineMatches(snapshot, 'secrets.provider_key', /sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|(?:sk_(?:live|test)|rk_live)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g);
}
