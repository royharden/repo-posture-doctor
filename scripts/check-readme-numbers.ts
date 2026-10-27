import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './corpus-io.ts';
import { markdownText } from '../src/core/report/md.ts';
import { RULE_IDS } from '../src/eval/labels.ts';
const BEGIN='<!-- BEGIN MEASURED RESULTS -->',END='<!-- END MEASURED RESULTS -->';
export function renderMeasurementBlock(records:Record<string,unknown>[]):string{
  if(!records.length)return 'Not yet measured. No admitted corpus or executed evaluation exists.';
  const last=records.at(-1)?.run_id;if(typeof last!=='string')throw new Error('invalid_result_run');
  const rows=records.filter(record=>record.run_id===last&&typeof record.arm==='string'&&typeof record.rule_id==='string'&&record.summary&&typeof record.summary==='object');
  if(!rows.length)throw new Error('result_rows_missing');
  const lines=['Generated from results/results.jsonl; latest run only.','', '| Arm | Split | Cohort | Rule | Recall | Decoy false alarm | Precision |','|---|---|---|---|---|---|---|'];
  for(const row of rows){
    if(!['S44','B0','S44_path','B1','B0_oos'].includes(String(row.arm))||!['dev','heldout'].includes(String(row.split))||!['single','scene','oos'].includes(String(row.cohort))||!RULE_IDS.concat('secrets.*').includes(String(row.rule_id)))throw new Error('invalid_result_label');
    const summary=row.summary as Record<string,unknown>;
    const rate=(name:string):string=>{const value=(summary[name]as{value?:unknown})?.value;if(value===null)return'N/A';if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw new Error('invalid_result_rate');return value.toFixed(4);};
    const values=[row.arm,row.split,row.cohort,row.rule_id].map(value=>{if(typeof value!=='string'||value.length>256)throw new Error('invalid_result_label');return markdownText(value);});
    lines.push(`| ${values.join(' | ')} | ${rate('recall')} | ${rate('false_alarm_rate')} | ${rate('precision')} |`);
  }
  lines.push('','Intervals, denominators, abstentions, group counts, valid/undefined bootstrap draws and paired contrasts are in the source records. Dev rows are diagnostic; scene/OOS rows are exploratory.');
  return lines.join('\n');
}
export function inspectReadme(readme:string,designPhrases:readonly string[],expectedBlock:string):string[]{
  // Windows and Unix line endings carry the same wording; all other phrase characters stay exact.
  readme=readme.replace(/\r\n/g,'\n');expectedBlock=expectedBlock.replace(/\r\n/g,'\n');
  const start=readme.indexOf(BEGIN),end=readme.indexOf(END);
  if(start<0||end<start||readme.indexOf(BEGIN,start+1)>=0||readme.indexOf(END,end+1)>=0)return['measurement_block_markers'];
  const actual=readme.slice(start+BEGIN.length,end).trim();const errors:string[]=[];
  if(actual!==expectedBlock.trim())errors.push('measurement_block_not_from_results');
  let outside=readme.slice(0,start)+readme.slice(end+END.length);
  // Approval belongs to exact design wording, never to a number reused in a measured claim.
  // Blank numeric characters in matched phrases rather than deleting text, so adjacent numbers cannot join.
  for(const phrase of designPhrases){
    if(!phrase.trim()||!/\d/.test(phrase)||/^\s*[\d.,]+\s*$/.test(phrase))return['invalid_readme_constants'];
    outside=outside.split(phrase).join(phrase.replace(/[0-9]/g,' '));
  }
  for(const token of outside.match(/[0-9]+(?:[.,][0-9]+)*/g)??[])errors.push(`unapproved_numeric_claim:${token}`);
  return [...new Set(errors)];
}
async function main():Promise<void>{
  const args=process.argv.slice(2);if(args.some(arg=>arg!=='--write')||args.length>1)throw new Error('invalid_arguments');
  const readmePath=resolve(ROOT,'README.md');let readme=await readFile(readmePath,'utf8');
  const config=JSON.parse(await readFile(resolve(ROOT,'config/readme-constants.json'),'utf8'))as{schema_version?:unknown;design_phrases?:unknown};
  if(config.schema_version!==2||!Array.isArray(config.design_phrases)||!config.design_phrases.every(item=>typeof item==='string'))throw new Error('invalid_readme_constants');
  let records:Record<string,unknown>[]=[];
  try{const text=await readFile(resolve(ROOT,'results/results.jsonl'),'utf8');records=text.split('\n').filter(Boolean).map(line=>JSON.parse(line)as Record<string,unknown>);}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('invalid_results_source');}
  const block=renderMeasurementBlock(records);
  if(args.includes('--write')){
    const start=readme.indexOf(BEGIN),end=readme.indexOf(END);if(start<0||end<start)throw new Error('measurement_block_markers');
    readme=readme.slice(0,start+BEGIN.length)+'\n'+block+'\n'+readme.slice(end);
    if(inspectReadme(readme,config.design_phrases,block).length)throw new Error('readme_numeric_claim_refused');
    await copyFile(readmePath,`${readmePath}.before-results.bak`,2);await writeFile(readmePath,readme,'utf8');
  }
  const errors=inspectReadme(readme,config.design_phrases,block);if(errors.length)throw new Error('readme_numeric_claim_refused');
  console.log('README numeric claims match design constants and the generated results block.');
}
// Source-only construction entrypoint. It is not invoked during Dirty Mode.
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/check-readme-numbers.ts')){
  main().catch(()=>{console.error('readme_check_failed');process.exitCode=2;});
}
