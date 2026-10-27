import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve,relative,sep } from 'node:path';
import { ROOT, hash, safeTreeFiles, pairsHash } from './corpus-io.ts';
import { validateLock } from '../src/eval/lock.ts';
import { validateFreeze, assertHeldoutReady } from '../src/eval/freeze.ts';
import type { ActualInputs } from '../src/eval/freeze.ts';
import type { LoadedCorpus } from './corpus-io.ts';
import { RULE_IDS } from '../src/eval/labels.ts';
import type { Label, Manifest } from '../src/eval/labels.ts';
import type { CorpusLock } from '../src/eval/lock.ts';

type GitRead = (args: string[]) => string;
const gitRead: GitRead = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
/** Generated records are mutable; separately hashed corpus inputs are not product source. */
function generatedOrCorpus(path: string): boolean {
  return /^(?:corpus\/(?:dev|heldout|\.out)\/)/.test(path) || path === 'corpus/heldout.lock.json' ||
    ['results/ADMISSION.json','results/FREEZE.json','results/HELDOUT-ATTEMPT.json','results/results.jsonl','results/results.md'].includes(path) ||
    /^results\/\.HELDOUT-ATTEMPT\.json\.[a-zA-Z0-9-]{1,100}\.tmp$/.test(path);
}
/** NUL-delimited Git paths avoid quoted-name ambiguity; ignored source files are included too. */
export function assertProductSourceClean(expectedCommit: string, git: GitRead = gitRead): string {
  const commit = git(['rev-parse','HEAD']).trim();
  if (commit !== expectedCommit) throw new Error('frozen_product_commit_mismatch');
  const tracked = git(['diff','--name-only','-z','HEAD','--','.']).split('\0').filter(Boolean);
  const untracked = git(['ls-files','--others','-z','--','.',':(exclude)node_modules',':(exclude)dist',':(exclude)corpus']).split('\0').filter(Boolean);
  if ([...tracked,...untracked].some(path => !generatedOrCorpus(path))) throw new Error('frozen_product_source_drift');
  return commit;
}
function counted(labels: readonly Label[]): Manifest['counts'] {
  const entries = new Map<string,{rule_id:string;polarity:Label['polarity'];cases:Set<string>;groups:Set<string>}>();
  for (const label of labels) {
    const key = `${label.rule_id}|${label.polarity}`;
    const entry = entries.get(key) ?? { rule_id:label.rule_id,polarity:label.polarity,cases:new Set<string>(),groups:new Set<string>() };
    entry.cases.add(label.case_id); entry.groups.add(label.group_id); entries.set(key,entry);
  }
  return [...entries.values()].map(entry => ({rule_id:entry.rule_id,polarity:entry.polarity,cases:entry.cases.size,groups:entry.groups.size}));
}
const countsKey = (counts: Manifest['counts']): string => JSON.stringify(counts.map(c => [c.rule_id,c.polarity,c.cases,c.groups]).sort((a,b)=>{
  const left=`${a[0]}|${a[1]}`,right=`${b[0]}|${b[1]}`;return left<right?-1:left>right?1:0;
}));
/** Minima belong to the single-rule cohort; scenes cannot pad its admission counts. */
export function assertActualHeldoutCounts(lock: CorpusLock, corpus: Pick<LoadedCorpus,'labels'|'manifest'>): void {
  if (corpus.labels.some(label => label.split !== 'heldout')) throw new Error('heldout_label_split_mismatch');
  const actual = counted(corpus.labels);
  if (countsKey(lock.counts) !== countsKey(actual) || countsKey(corpus.manifest.counts) !== countsKey(actual)) throw new Error('lock_actual_counts_mismatch');
  const single = counted(corpus.labels.filter(label => label.cohort === 'single'));
  for (const rule of RULE_IDS) for (const polarity of ['positive','decoy'] as const) {
    const count = single.find(item => item.rule_id === rule && item.polarity === polarity);
    if (!count || count.cases < 30 || count.groups < 15) throw new Error('insufficient_actual_heldout_counts');
  }
  for (const rule of ['secrets.env_file_present','tests.no_test_files','tests.no_test_script','tests.runner_not_in_ci','obs.no_logging_library','rls.table_rls_not_enabled']) {
    const count = single.find(item => item.rule_id === rule && item.polarity === 'expected_unknown');
    if (!count || count.cases < 10) throw new Error('insufficient_actual_unknown_counts');
  }
  const scenes = corpus.labels.filter(label => label.cohort === 'scene');
  const sceneCases = new Set(scenes.map(label => label.case_id));
  if (sceneCases.size < 8 || [...sceneCases].some(id => RULE_IDS.some(rule => !scenes.some(label => label.case_id === id && label.rule_id === rule)))) throw new Error('insufficient_actual_scene_counts');
  const oos = corpus.labels.filter(label => label.cohort === 'oos' && label.rule_id === 'secrets.*');
  if (new Set(oos.map(label => label.group_id)).size < 10 || ['positive','decoy'].some(polarity => new Set(oos.filter(label => label.polarity === polarity).map(label => label.case_id)).size < 20)) throw new Error('insufficient_actual_oos_counts');
}
export async function jsonFile(path:string):Promise<unknown>{return JSON.parse(await readFile(resolve(ROOT,path),'utf8'));}
export async function admission(split:'dev'|'heldout'):Promise<void>{
  const record=await jsonFile('results/ADMISSION.json') as Record<string,unknown>;
  if(record.schema_version!==1||record.g0!=='GO'||(split==='heldout'&&record.g1!=='GO')||typeof record.ca!=='string'||typeof record.cr!=='string'||record.ca===record.cr||record.appointed_by!=='Roy')throw new Error('independent_admission_pending');
}
export async function preflightHeldout():Promise<void>{validateLock(await jsonFile('corpus/heldout.lock.json'));const freeze=validateFreeze(await jsonFile('results/FREEZE.json'));assertProductSourceClean(freeze.product_commit);}
export async function heldoutBindings(corpus:LoadedCorpus):Promise<{actual:ActualInputs;freeze_sha256:string}> {
  const lockBytes=await readFile(resolve(ROOT,'corpus/heldout.lock.json'));
  const freezeBytes=await readFile(resolve(ROOT,'results/FREEZE.json'));
  const tree=resolve(ROOT,'src/eval');
  const matcher_sha256=pairsHash(await Promise.all((await safeTreeFiles(tree)).map(async path=>({path:relative(tree,path).split(sep).join('/'),bytes:await readFile(path)}))));
  const maps=['baselines/b1-vca13/mapping.json','baselines/gitleaks/mapping.json'];
  const mapping_sha256=pairsHash(await Promise.all(maps.map(async path=>({path,bytes:await readFile(resolve(ROOT,path))}))));
  const receipt=await jsonFile('baselines/gitleaks/mapping.json') as Record<string,unknown>;
  const actual:ActualInputs={product_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
    lockfile_sha256:hash(await readFile(resolve(ROOT,'package-lock.json'))),config_sha256:hash(await readFile(resolve(ROOT,'config/rules.json'))),
    rules_digest:corpus.manifest.rulesDigest,matcher_sha256,mapping_sha256,
    b1_pin:'fe0a10016ac8fef46d8fa66e080b03f087fad84d',gitleaks_pin:typeof receipt.release==='string'?receipt.release:'not-captured',
    corpus_lock_sha256:hash(lockBytes),generator_sha256:corpus.generator_sha256,corpus_sha256:corpus.corpus_sha256,labels_sha256:corpus.labels_sha256,seed:corpus.manifest.seed};
  const binding=assertHeldoutReady(JSON.parse(lockBytes.toString('utf8')),JSON.parse(freezeBytes.toString('utf8')),actual);
  assertActualHeldoutCounts(binding.lock,corpus);
  assertProductSourceClean(binding.freeze.product_commit);
  return{actual,freeze_sha256:hash(freezeBytes)};
}
