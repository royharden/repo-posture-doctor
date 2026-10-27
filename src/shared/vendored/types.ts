// New S44 code, NOT vendored (PLAN.md M0, r1 B2).
// The vendored S26 wilson.ts imports `Interval` from './types.ts'. S26's own types.ts pulls in six S26-only modules,
// so this shim exports only the one type wilson.ts needs, with the same shape as S26 `src/core/evalkit/types.ts`.
export interface Interval { low: number; high: number }
