import type { RuleResult } from '../core/types.ts';
/** Presentation-only severity chip; no repository rating or security verdict is derived. */
export function SeverityChip({value}:{value:RuleResult['severity_hint']}) { return <span className={`chip severity-${value}`}>{value}</span>; }
