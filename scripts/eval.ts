import { readFile, appendFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, hash, parseArguments, loadCorpus, jsonHash, caseBytes, pairsHash, childOf } from './corpus-io.ts';
import type { LoadedCorpus } from './corpus-io.ts';
import { admission, preflightHeldout, heldoutBindings, assertProductSourceClean } from './gate-io.ts';
import { beginAttempt } from '../src/eval/attempt.ts';
import { scoreCase } from '../src/eval/match.ts';
import type { CaseScore } from '../src/eval/match.ts';
import { summarize, familySummaries } from '../src/eval/metrics.ts';
import { compareArms } from '../src/eval/compare.ts';
import { createSnapshot, classifyPath } from '../src/core/snapshot.ts';
import { scan } from '../src/core/scan.ts';
import { parseConfig } from '../src/core/config.ts';
import { safeValue } from '../src/core/report/json.ts';
import { detectedSecretValues } from '../src/core/rules/secrets/index.ts';
import { assertNoLeaks } from '../src/core/leakGuard.ts';
import type { Report } from '../src/core/types.ts';
import { runB0, runB0Oos } from '../baselines/b0-naive/index.ts';
import { runB1 } from '../baselines/b1-vca13/adapter.ts';
import type { B1Output } from '../baselines/b1-vca13/adapter.ts';
import type { Label } from '../src/eval/labels.ts';

/** N/A comparator cohorts produce no rows and never call the comparator. Other arms remain independent. */
export async function scoreB1Cohort(case_id:string,labels:Label[],report:Report|null,before:()=>Promise<B1Output>,empty:()=>Report):Promise<{s44:CaseScore[];b1:CaseScore[];unmapped:number}>{
  const mapped=labels.filter(label=>(label.rule_id.startsWith('secrets.')||label.rule_id.startsWith('rls.'))&&label.path!==null&&label.cohort!=='oos');
  if(!mapped.length)return{s44:[],b1:[],unmapped:0};
  const s44=scoreCase(case_id,mapped,report,{match_level:'path',hard_error:report===null});
  try{const output=await before();const wrapper={...(report??empty()),results:output.results};
    return{s44,b1:scoreCase(case_id,mapped,wrapper,{match_level:'path'}),unmapped:output.unmapped};
  }catch{return{s44,b1:scoreCase(case_id,mapped,null,{match_level:'path',hard_error:true}),unmapped:0};}
}

/** Every baseline reads the exact bound materialized bytes, including its own intended selection. */
async function verifyMaterialized(corpus:LoadedCorpus,split:'dev'|'heldout'):Promise<void>{
  const root=resolve(ROOT,'corpus/.out',split);
  for(const item of corpus.cases){const directory=resolve(root,item.case_id);const pairs:{path:string;bytes:Uint8Array}[]=[];
    const visit=async(dir:string):Promise<void>=>{const {readdir}=await import('node:fs/promises');for(const name of await readdir(dir)){
      const path=resolve(dir,name),stat=await lstat(path);
      if(!childOf(directory,path)||stat.isSymbolicLink()||(await realpath(path)).toLowerCase()!==path.toLowerCase())throw new Error('materialized_path_refused');
      if(stat.isDirectory())await visit(path);else if(stat.isFile())pairs.push({path:relative(directory,path).split(sep).join('/'),bytes:await readFile(path)});else throw new Error('materialized_not_regular');
    }};await visit(directory);
    if(pairsHash(pairs)!==corpus.manifest.cases.find(record=>record.case_id===item.case_id)?.files_sha256)throw new Error('materialized_case_mismatch');
  }
}
function planted(corpus:LoadedCorpus):string[]{
  const values:string[]=[];
  for(const label of corpus.labels){if(label.polarity!=='positive'||!label.path||!label.span||!(label.cohort==='oos'||['secrets.provider_key','secrets.service_role_jwt','secrets.secret_assignment'].includes(label.rule_id)))continue;
    const file=corpus.cases.find(item=>item.case_id===label.case_id)?.files.find(item=>item.path===label.path);if(!file)throw new Error('label_span_file_missing');
    const text=caseBytes(file).toString('utf8');const offset=(line:number,col:number)=>{let p=0;for(let i=1;i<line;i++){const next=text.indexOf('\n',p);if(next<0)throw new Error('label_span_outside_file');p=next+1;}return p+col-1;};
    const start=offset(label.span.startLine,label.span.startCol),end=offset(label.span.endLine,label.span.endCol)+1;
    if(start<0||end>text.length||end<=start)throw new Error('label_span_outside_file');values.push(text.slice(start,end));
  }return values;
}
async function evaluate():Promise<void>{
  const options=parseArguments(process.argv.slice(2));if(options.check)throw new Error('eval_check_unsupported');
  await admission(options.split);if(options.split==='heldout')await preflightHeldout();
  const corpus=await loadCorpus(options.split,options.seed);const repeat=await loadCorpus(options.split,options.seed);
  if(jsonHash(corpus)!==jsonHash(repeat))throw new Error('corpus_not_reproducible');
  await verifyMaterialized(corpus,options.split);
  const run_id=randomUUID();
  let heldoutCommit:string|undefined;
  if(options.split==='heldout'){
    const binding=await heldoutBindings(corpus);
    heldoutCommit=binding.actual.product_commit;
    await beginAttempt(resolve(ROOT,'results/HELDOUT-ATTEMPT.json'),{schema_version:1,attempt:1,attempt_id:run_id,started_at:new Date().toISOString(),inputs:{freeze_sha256:binding.freeze_sha256,corpus_lock_sha256:binding.actual.corpus_lock_sha256,corpus_sha256:corpus.corpus_sha256,labels_sha256:corpus.labels_sha256,product_commit:binding.actual.product_commit}});
  }
  // No scanner or baseline prediction is called before the held-out attempt claim above.
  const config=parseConfig(await readFile(resolve(ROOT,'config/rules.json'),'utf8'));
  const arms:Record<string,CaseScore[]>={S44:[],B0:[],S44_path:[],B1:[],B0_oos:[]};
  const guarded=planted(corpus),detected:string[]=[];let unmapped=0;
  if(heldoutCommit)assertProductSourceClean(heldoutCommit);
  for(const item of corpus.cases){
    const labels=corpus.labels.filter(label=>label.case_id===item.case_id);
    const snapshot=createSnapshot(item.case_id,item.files.map(file=>{const bytes=caseBytes(file);return{path:file.path,size:bytes.length,kind:classifyPath(file.path),content:bytes.toString('utf8')};}));
    const caseDetected=detectedSecretValues(snapshot,config);detected.push(...caseDetected);
    let report:Report|null=null;try{report=scan(snapshot,undefined,config);}catch{/* Hard errors keep all case denominators. */}
    arms.S44!.push(...scoreCase(item.case_id,labels,report,{match_level:'native',hard_error:report===null}));
    try{const baseline={...(report??scan(snapshot,[],config)),results:runB0(snapshot)};arms.B0!.push(...scoreCase(item.case_id,labels,baseline));}
    catch{arms.B0!.push(...scoreCase(item.case_id,labels,null,{hard_error:true}));}
    const mapped=await scoreB1Cohort(item.case_id,labels,report,()=>runB1(resolve(ROOT,'corpus/.out',options.split,item.case_id),guarded,caseDetected),()=>scan(snapshot,[],config));
    arms.S44_path!.push(...mapped.s44);arms.B1!.push(...mapped.b1);unmapped+=mapped.unmapped;
    const oos=labels.filter(label=>label.cohort==='oos');
    if(oos.length){try{arms.B0_oos!.push(...scoreCase(item.case_id,oos,{...(report??scan(snapshot,[],config)),results:runB0Oos(snapshot)}));}catch{arms.B0_oos!.push(...scoreCase(item.case_id,oos,null,{hard_error:true}));}}
  }
  const records:Record<string,unknown>[]=[];
  for(const [arm,rows]of Object.entries(arms))for(const cohort of ['single','scene','oos'] as const){const selected=rows.filter(row=>row.cohort===cohort);if(!selected.length)continue;
    const settings={split:options.split,cohort,seed:options.seed};
    for(const rule_id of [...new Set(selected.map(row=>row.rule_id))]){const perRule=selected.filter(row=>row.rule_id===rule_id);records.push({schema_version:1,run_id,split:options.split,arm,cohort,rule_id,match_level:perRule[0]!.match_level,summary:summarize(perRule,settings),cases:perRule});}
    records.push({schema_version:1,run_id,split:options.split,arm,cohort,families:familySummaries(selected,settings)});
  }
  for(const cohort of ['single','scene'] as const){const settings={split:options.split,cohort,seed:options.seed};
    for(const [left,right]of [['S44','B0'],['S44_path','B1']]as const){const l=arms[left]!.filter(row=>row.cohort===cohort),r=arms[right]!.filter(row=>row.cohort===cohort);for(const rule_id of [...new Set(l.map(row=>row.rule_id))])records.push({schema_version:1,run_id,split:options.split,cohort,rule_id,contrast:`${left}-${right}`,summary:compareArms(l.filter(row=>row.rule_id===rule_id),r.filter(row=>row.rule_id===rule_id),settings)});}
  }
  records.push({schema_version:1,run_id,split:options.split,arm:'B2',status:'not yet measured',reason:'capture_receipt_and_pinned_mapping_pending',b1_unmapped:unmapped});
  const safe=safeValue(records,[...guarded,...detected]);const jsonl=safe.map(record=>JSON.stringify(record)).join('\n')+'\n';
  const lines=['# Evaluation results','',`Split: ${options.split}. Source: results.jsonl run ${run_id}.`,'','| Arm | Cohort | Rule | Recall | Decoy false alarm | Precision | Missed unknown |','|---|---|---|---|---|---|---|'];
  for(const record of safe){if(!('rule_id'in record)||!('summary'in record)||!('arm'in record))continue;const r=record as {arm:string;cohort:string;rule_id:string;summary:ReturnType<typeof summarize>};const rate=(v:number|null)=>v===null?'N/A':v.toFixed(4);lines.push(`| ${r.arm} | ${r.cohort} | ${r.rule_id} | ${rate(r.summary.recall.value)} | ${rate(r.summary.false_alarm_rate.value)} | ${rate(r.summary.precision.value)} | ${r.summary.counts.missed_unknown} |`);}
  lines.push('','B2: not yet measured. Intervals, group counts, valid/undefined draws, abstentions, confusion counts and paired differences are in results.jsonl. Dev results are diagnostic; scene/OOS results are exploratory.');
  const md=lines.join('\n')+'\n';assertNoLeaks([jsonl,md],guarded,detected);
  await mkdir(resolve(ROOT,'results'),{recursive:true});await appendFile(resolve(ROOT,'results/results.jsonl'),jsonl,'utf8');await writeFile(resolve(ROOT,'results/results.md'),md,'utf8');
  console.log('Evaluation records written; see results/results.jsonl and results/results.md.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await evaluate();}catch{console.error('evaluation_refused_or_failed: inspect gates, pins, independent corpus and fresh one-use attempt; no raw input is printed');process.exitCode=2;}
}
