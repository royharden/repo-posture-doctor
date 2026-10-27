/** Capture is an explicit normal-mode handoff, never an implicit install, download or subprocess. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function captureGitleaks(): never {
  throw new Error('capture_deferred_requires_normal_mode_pinned_release_and_verified_flags');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { captureGitleaks(); } catch { console.error('capture_deferred_requires_normal_mode_pinned_release_and_verified_flags'); process.exitCode = 2; }
}
