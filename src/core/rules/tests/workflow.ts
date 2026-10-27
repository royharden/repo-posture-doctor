/** Conservative YAML subset: recognizes workflow mappings, sequences and block run scalars.
 * Unsupported YAML constructs abstain rather than inventing successful parsing. */
export interface Workflow { runs: string[]; reusable: boolean }
export function parseWorkflow(text: string): Workflow | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const runs: string[] = []; let reusable = false; let jobs = false; let sawJobs = false; let sawJob = false; let jobIndent = -1;
  let jobFieldIndent = -1; let stepsIndent = -1; let stepIndent = -1; let stepFieldIndent = -1;
  let blockIndent = -1; let block: string[] = []; let sawMapping = false;
  const flush = () => { if (blockIndent >= 0) runs.push(block.join('\n')); blockIndent = -1; block = []; };
  for (const raw of lines) {
    if (/^\s*\t/.test(raw)) return null;
    const indent = raw.length - raw.trimStart().length;
    if (blockIndent >= 0 && (!raw.trim() || indent > blockIndent)) { block.push(raw.trim()); continue; }
    flush();
    let line = raw.trim();
    if (!line || line.startsWith('#') || line === '---' || line === '...') continue;
    // Flow collections, aliases, explicit tags and multi-line quoted scalars are intentionally unsupported.
    if (/^(?:[?&*!]|\{|\[)/.test(line)) return null;
    const sequencePrefix = /^-\s+/.exec(line)?.[0]; const sequence = sequencePrefix !== undefined;
    const mappingIndent = indent + (sequencePrefix?.length ?? 0);
    if (sequence) line = line.slice(sequencePrefix!.length);
    const pair = /^(?:([A-Za-z_][\w.-]*)|"([^"\n]+)"|'([^'\n]+)')\s*:\s*(.*)$/.exec(line);
    if (!pair) {
      // A sequence scalar (matrix values, branches, etc.) is legal; free prose is not a mapping.
      if (sequence && stepsIndent < 0 && !/[:{}[\]]/.test(line)) continue;
      return null;
    }
    sawMapping = true;
    const key = pair[1] ?? pair[2] ?? pair[3]; let value = pair[4].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const commentless = value.replace(/\s+#.*$/, '').trimEnd();
      if (commentless.length < 2 || !commentless.endsWith(quote)) return null;
      if (quote === '"') { try { value = JSON.parse(commentless) as string; } catch { return null; } }
      else value = commentless.slice(1, -1).replace(/''/g, "'");
    } else {
      value = value.replace(/\s+#.*$/, '').trimEnd();
      if (value.startsWith('[') && !value.endsWith(']')) return null;
      if (value.startsWith('{') && !value.endsWith('}')) return null;
      if (/^[&*!]/.test(value)) return null;
    }
    let runStep = false;
    if (indent === 0) {
      if (sequence) return null;
      jobs = key === 'jobs'; jobIndent = -1; jobFieldIndent = -1; stepsIndent = -1; stepIndent = -1; stepFieldIndent = -1;
      if (jobs) { if (value !== '') return null; sawJobs = true; }
    }
    if (jobs && indent > 0) {
      if (jobIndent < 0) jobIndent = indent;
      if (indent < jobIndent) return null;
      if (indent === jobIndent) {
        // jobs is a block mapping, and each job must itself be a block mapping.
        if (sequence || value !== '') return null;
        sawJob = true;
        jobFieldIndent = -1; stepsIndent = -1; stepIndent = -1; stepFieldIndent = -1;
      } else {
        if (jobFieldIndent < 0) jobFieldIndent = indent;
        // Leaving steps closes its context, including when a sibling env mapping follows it.
        if (stepsIndent >= 0 && (indent < stepsIndent || (indent === stepsIndent && !sequence))) {
          stepsIndent = -1; stepIndent = -1; stepFieldIndent = -1;
        }
        if (indent === jobFieldIndent && !sequence) {
          if (key === 'steps') {
            if (value !== '') return null; // Flow steps are outside this parser's supported subset.
            stepsIndent = indent; stepIndent = -1; stepFieldIndent = -1;
          }
          if (key === 'uses') reusable = true;
        } else if (stepsIndent >= 0) {
          if (stepIndent < 0) { if (!sequence) return null; stepIndent = indent; }
          if (indent < stepIndent) return null;
          if (sequence && indent === stepIndent) stepFieldIndent = mappingIndent;
          else if (indent === stepIndent) return null;
          // Only direct fields of a step count; nested env.run is ordinary data.
          runStep = mappingIndent === stepFieldIndent && key === 'run';
        }
      }
    }
    if (runStep) {
      if (/^[|>][+-]?$/.test(value)) { blockIndent = mappingIndent; block = []; }
      else if (value) runs.push(value);
      else return null;
    } else if (/^[|>][+-]?$/.test(value)) {
      // Other scalar blocks are not run commands: consume them without interpreting YAML keys inside.
      // Such blocks are uncommon in workflow control structure; abstain to avoid misclassification.
      return null;
    }
  }
  flush();
  return sawMapping && sawJobs && sawJob ? { runs, reusable } : null;
}
