import type { Report } from '../types.ts';
import { toSafe } from '../safe.ts';

/** Sanitize string values and property names, while preserving JSON structural whitespace. */
export function safeValue<T>(value: T, detectedValues: readonly string[] = []): T {
  const visit = (item: unknown): unknown => {
    if (typeof item === 'string') return toSafe(item, detectedValues);
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [toSafe(key, detectedValues), visit(child)]));
    return item;
  };
  return visit(value) as T;
}
export function serializeReport(report: Report, detectedValues: readonly string[] = []): string {
  return `${JSON.stringify(safeValue(report, detectedValues), null, 2)}\n`;
}
