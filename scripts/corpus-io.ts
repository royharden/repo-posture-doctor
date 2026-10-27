import { readFile, readdir, lstat, realpath, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute, dirname, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { validateCases, validateLabels, validateManifest } from '../src/eval/labels.ts';
import type { CorpusCase, Manifest, Label } from '../src/eval/labels.ts';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const hash = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
export const jsonHash = (value: unknown): string => hash(JSON.stringify(value));
const compare = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;
export function childOf(base: string, path: string): boolean { const r=relative(base,path); return r !== '' && !isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`); }
export async function safeTreeFiles(root: string): Promise<string[]> {
  const result: string[]=[];
  async function visit(dir: string):Promise<void> {
    for (const name of (await readdir(dir)).sort(compare)) {
      if (/^(?:\.env(?:\..*)?|\.git|\.creds|node_modules|auth\.json)$/i.test(name)) throw new Error('corpus_source_forbidden_entry');
      const full=resolve(dir,name); const stat=await lstat(full);
      if (stat.isSymbolicLink() || !childOf(root,full) || (await realpath(full)).toLowerCase() !== full.toLowerCase()) throw new Error('corpus_source_redirected');
      if (stat.isDirectory()) await visit(full); else if (stat.isFile()) result.push(full); else throw new Error('corpus_source_not_regular');
    }
  }
  await visit(root); return result.sort(compare);
}
/** Length-prefixed UTF-8 path + byte payload, sorted by normalized relative path. Shared CA convention. */
export function pairsHash(pairs: {path:string;bytes:Uint8Array}[]):string {
  const digest=createHash('sha256');
  for(const pair of [...pairs].sort((a,b)=>compare(a.path,b.path))) {
    const path=Buffer.from(pair.path,'utf8'); const size=Buffer.alloc(8);size.writeUInt32BE(path.length,0);size.writeUInt32BE(pair.bytes.length,4);
    digest.update(size).update(path).update(pair.bytes);
  } return digest.digest('hex');
}
export function caseBytes(file: CorpusCase['files'][number]):Buffer { return Buffer.from(file.content,file.encoding === 'base64' ? 'base64' : 'utf8'); }
export function caseHash(item:CorpusCase):string { return pairsHash(item.files.map(file=>({path:file.path,bytes:caseBytes(file)}))); }
export interface LoadedCorpus { cases:CorpusCase[]; labels:Label[]; manifest:Manifest; corpus_sha256:string; labels_sha256:string; generator_sha256:string }
export async function loadCorpus(split:'dev'|'heldout',seed:number):Promise<LoadedCorpus> {
  const source=resolve(ROOT,'corpus',split); const entry=resolve(source,'index.ts');
  const paths=await safeTreeFiles(source);
  const generator_sha256=pairsHash(await Promise.all(paths.map(async path=>({path:relative(source,path).split(sep).join('/'),bytes:await readFile(path)}))));
  if (!paths.includes(entry)) throw new Error('independent_corpus_not_delivered');
  // Caller must perform held-out gate checks before any generator import.
  const module=await import(pathToFileURL(entry).href) as {generate?:(seed:number,split:'dev'|'heldout')=>unknown};
  if(typeof module.generate !== 'function') throw new Error('invalid_corpus_generator');
  const raw=module.generate(seed,split) as {cases:unknown;labels:unknown;manifest:unknown};
  const cases=validateCases(raw.cases);const labels=validateLabels(raw.labels);const manifest=validateManifest(raw.manifest);
  if(manifest.split !== split || manifest.seed !== seed || manifest.generatorSha !== generator_sha256) throw new Error('corpus_manifest_binding_mismatch');
  const rules=await readFile(resolve(ROOT,'docs/RULES.md'),'utf8');
  const marker='<!-- BEGIN RULE CARDS v1.0-draft -->';const end='<!-- END RULE CARDS v1.0-draft -->';
  const cardText=rules.slice(rules.indexOf(marker)+marker.length+1,rules.indexOf(end)).replace(/\r\n/g,'\n');
  if(hash(cardText) !== manifest.rulesDigest) throw new Error('corpus_rules_digest_mismatch');
  const known=new Set(cases.map(item=>item.case_id));
  if(manifest.cases.length !== cases.length || manifest.cases.some(item=>!known.has(item.case_id)) || labels.some(item=>!known.has(item.case_id)||item.split!==split)) throw new Error('corpus_case_membership_mismatch');
  for(const item of cases) if(manifest.cases.find(record=>record.case_id===item.case_id)?.files_sha256 !== caseHash(item)) throw new Error('case_hash_mismatch');
  const expectedCounts=new Map<string,{cases:Set<string>;groups:Set<string>}>();
  for(const label of labels){
    const record=manifest.cases.find(item=>item.case_id===label.case_id);
    if(!record||record.group_id!==label.group_id||record.cohort!==label.cohort||!record.rule_ids.includes(label.rule_id))throw new Error('label_manifest_membership_mismatch');
    const key=`${label.rule_id}|${label.polarity}`;const counts=expectedCounts.get(key)??{cases:new Set<string>(),groups:new Set<string>()};
    counts.cases.add(label.case_id);counts.groups.add(label.group_id);expectedCounts.set(key,counts);
  }
  if(new Set(manifest.counts.map(item=>`${item.rule_id}|${item.polarity}`)).size!==manifest.counts.length||manifest.counts.length!==expectedCounts.size)throw new Error('manifest_counts_mismatch');
  for(const count of manifest.counts){const actual=expectedCounts.get(`${count.rule_id}|${count.polarity}`);if(!actual||actual.cases.size!==count.cases||actual.groups.size!==count.groups)throw new Error('manifest_counts_mismatch');}

  return {cases,labels,manifest,corpus_sha256:jsonHash(cases.map(item=>({case_id:item.case_id,files_sha256:caseHash(item)}))),labels_sha256:jsonHash(labels),generator_sha256};
}
export async function materialize(corpus:LoadedCorpus,split:'dev'|'heldout'):Promise<string> {
  const target=resolve(ROOT,'corpus/.out',split);const parent=dirname(target);
  await mkdir(parent,{recursive:true});
  if((await realpath(parent)).toLowerCase() !== parent.toLowerCase()) throw new Error('materialize_parent_redirected');
  await mkdir(target); // Refuse existing output; never overwrite materialized bytes.
  for(const item of corpus.cases) for(const file of item.files) {
    const output=resolve(target,item.case_id,...file.path.split('/'));
    if(!childOf(target,output)) throw new Error('materialize_path_refused');
    await mkdir(dirname(output),{recursive:true});await writeFile(output,caseBytes(file),{flag:'wx'});
  }
  return target;
}
export function parseArguments(args:string[]):{split:'dev'|'heldout';seed:number;check:boolean} {
  let split:'dev'|'heldout'='dev';let seed=4401;let check=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--split' && (args[i+1]==='dev'||args[i+1]==='heldout')) split=args[++i] as typeof split;
    else if(args[i]==='--seed' && /^\d{1,10}$/.test(args[i+1]??'')) {seed=Number(args[++i]);if(!Number.isSafeInteger(seed)||seed>4294967295)throw new Error('invalid_seed');}
    else if(args[i]==='--check')check=true;else throw new Error('invalid_arguments');
  } return {split,seed,check};
}
