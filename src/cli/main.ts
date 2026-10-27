#!/usr/bin/env node
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { walk, validateOutput, InputRefused } from './walk.ts';
import { scan } from '../core/scan.ts';
import { parseConfig } from '../core/config.ts';
import { serializeReport } from '../core/report/json.ts';
import { renderMarkdown } from '../core/report/md.ts';
import { assertNoLeaks } from '../core/leakGuard.ts';
import { detectedSecretValues } from '../core/rules/secrets/index.ts';
import { toSafe } from '../core/safe.ts';

export const HELP = 'posture-doctor scan <root> [--out <new-dir>]\nStatic evidence in the scanned scope; absence of a finding is not proof of safety.\nReads a quiescent local folder only. No network, key validation or git history.\nExit: 0 complete; 2 input refused; 3 coverage incomplete (cap or skipped entry).';
export async function main(args = process.argv.slice(2)): Promise<number> {
  if (args.length === 0 || (args.length === 1 && ['--help','-h'].includes(args[0]!))) { console.log(HELP); return 0; }
  if (args[0] !== 'scan' || !args[1] || args[1].startsWith('-') ||
      !(args.length === 2 || (args.length === 4 && args[2] === '--out' && args[3] && !args[3].startsWith('-')))) {
    console.error('input_refused: invalid_arguments'); return 2;
  }
  try {
    const root = resolve(args[1]);
    const output = args[3] ? await validateOutput(root, args[3]) : undefined;
    const snapshot = await walk(root);
    const config = parseConfig(await readFile(new URL('../../config/rules.json', import.meta.url), 'utf8'));
    const report = scan(snapshot, undefined, config);
    // Core scan sanitizes all strings and detected-value occurrences before serialization.
    const json = serializeReport(report);
    const markdown = renderMarkdown(report);
    assertNoLeaks([json, markdown], [], detectedSecretValues(snapshot, config));
    if (output) {
      // Exclusive creation prevents overwriting an existing output or a competing invocation.
      await mkdir(output);
      await writeFile(resolve(output, 'report.json'), json, { encoding: 'utf8', flag: 'wx' });
      await writeFile(resolve(output, 'report.md'), markdown, { encoding: 'utf8', flag: 'wx' });
      console.log(toSafe(`Report written. ${report.results.filter(r=>r.concern === true).length} concerning observations; ${report.scope.files_seen} paths inventoried.`));
    } else {
      console.log(toSafe(`Static evidence: ${report.scope.files_seen} paths inventoried; ${report.results.filter(r=>r.concern === true).length} concerning observations.`));
      for (const result of report.results.slice(0, 20)) console.log(toSafe(`${result.rule_id}: ${result.state} — ${result.message}`).slice(0, 500));
      if (report.results.length > 20) console.log('Preview capped; use --out for the complete report.');
    }
    return report.scope.inventory_complete && report.scope.content_complete ? 0 : 3;
  } catch (error) {
    console.error(toSafe(error instanceof InputRefused ? `input_refused: ${error.message}` : 'input_refused: local_io_failure'));
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
