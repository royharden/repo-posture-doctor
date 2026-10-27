import { findCandidates } from './safe.ts';

/** The candidate finder normalizes formats only. Callers supply detections, never its unfiltered superset. */
export function guardedBodies(plantedValues: readonly string[], detectedValues: readonly string[]): string[] {
  const bodies = new Set<string>();
  for (const value of [...plantedValues, ...detectedValues]) {
    const candidates = findCandidates(value);
    const candidate = candidates.find(item => item.start === 0 && (item.end === value.length || item.kind === 'pem'));
    let body = value;
    if (candidate?.kind === 'pem') {
      const after = value.slice((candidate.marker ?? '').length);
      const end = /-----END (?:[A-Z]+ )*PRIVATE KEY-----/.exec(after);
      const material = end ? after.slice(0, end.index) : /^(?:(?:\\\\r\\\\n|\\\\n|\\r\\n|\\n|\\r)|\s|[A-Za-z0-9+/=])*/.exec(after)?.[0] ?? '';
      body = material.replace(/\\\\r\\\\n|\\\\n|\\r\\n|\\n|\\r|\s/g, '');
    } else if (candidate?.prefix) body = value.slice(candidate.prefix.length);
    if (body.length >= 6) bodies.add(body);
  }
  return [...bodies];
}
export interface LeakFailure { output_index: number; guarded_value_index: number }
/** Reports indices only: neither a secret window nor an output excerpt leaves this guard. */
export function inspectLeaks(outputs: readonly string[], plantedValues: readonly string[], detectedValues: readonly string[] = []): LeakFailure[] {
  const failures: LeakFailure[] = [];
  const bodies = guardedBodies(plantedValues, detectedValues);
  outputs.forEach((output, output_index) => bodies.forEach((body, guarded_value_index) => {
    for (let offset = 0; offset <= body.length - 6; offset++) {
      if (output.includes(body.slice(offset, offset + 6))) { failures.push({ output_index, guarded_value_index }); break; }
    }
  }));
  return failures;
}
export function assertNoLeaks(outputs: readonly string[], plantedValues: readonly string[], detectedValues: readonly string[] = []): void {
  if (inspectLeaks(outputs, plantedValues, detectedValues).length) throw new Error('leak_guard_failure');
}
