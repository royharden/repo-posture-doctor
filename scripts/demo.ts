import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { demoScaffold } from '../demo/scaffold.ts';
import { walk } from '../src/cli/walk.ts';
import { scan } from '../src/core/scan.ts';
import { serializeReport } from '../src/core/report/json.ts';
import { renderMarkdown } from '../src/core/report/md.ts';
import { toSafe } from '../src/core/safe.ts';

// Demo only — never evaluated. No corpus, network, environment variables or keys.
const root = await mkdtemp(join(tmpdir(), 'posture-demo-'));
for (const file of demoScaffold()) {
  const path = join(root,...file.path.split('/')); await mkdir(dirname(path), {recursive:true});
  await writeFile(path,file.content ?? '',{encoding:'utf8',flag:'wx'});
}
const report = scan(await walk(root));
const out = await mkdtemp(join(tmpdir(), 'posture-demo-report-'));
await writeFile(join(out,'report.json'),serializeReport(report),{encoding:'utf8',flag:'wx'});
await writeFile(join(out,'report.md'),renderMarkdown(report),{encoding:'utf8',flag:'wx'});
console.log('Demo only — never evaluated. Runtime output is a synthetic demonstration, never an error-rate measurement.');
console.log(toSafe(`Scanned ${report.scope.files_seen} demo paths; ${report.results.filter(r=>r.concern === true).length} concerning observations. Reports in ${out}`));
