import { wilson } from '../shared/vendored/wilson.ts';
import type { Interval } from '../shared/vendored/types.ts';
import { emptyCounts } from './match.ts';
import type { CaseScore, MetricCounts } from './match.ts';
import { groupBootstrap } from './bootstrap.ts';
import type { BootstrapOptions, BootstrapResult } from './bootstrap.ts';
export type { MetricCounts } from './match.ts';
export function aggregate(rows:readonly MetricCounts[]):MetricCounts {
  const total=emptyCounts();for(const row of rows){for(const key of Object.keys(total) as (keyof MetricCounts)[]){if(key==='confusion')continue;total[key]+=row[key];}for(const [key,value]of Object.entries(row.confusion))total.confusion[key]=(total.confusion[key]??0)+value;}return total;
}
export interface Rate { value:number|null; numerator:number;denominator:number;wilson:Interval|null;bootstrap:BootstrapResult }
export interface MetricSummary { counts:MetricCounts;recall:Rate;false_alarm_rate:Rate;precision:Rate;prevalence:number|null;noisy:boolean }
const divide=(a:number,b:number):number|null=>b>0?a/b:null;
export function summarize(rows:readonly CaseScore[],options:BootstrapOptions):MetricSummary {
  if(rows.some(row=>row.split!==options.split||row.cohort!==options.cohort))throw new Error('mixed_metric_cohorts');
  const counts=aggregate(rows);
  const rate=(numerator:number,denominator:number,eligible:readonly CaseScore[],statistic:(c:MetricCounts)=>number|null):Rate=>({value:divide(numerator,denominator),numerator,denominator,wilson:wilson(numerator,denominator),bootstrap:groupBootstrap(eligible,sample=>statistic(aggregate(sample)),options)});
  const recall=rate(counts.TP,counts.P,rows.filter(row=>row.P>0),c=>divide(c.TP,c.P));
  const false_alarm_rate=rate(counts.decoy_FA,counts.D-counts.abstained_decoys,rows.filter(row=>row.D>0),c=>divide(c.decoy_FA,c.D-c.abstained_decoys));
  const precision=rate(counts.TP,counts.TP+counts.FA+counts.U+counts.Dup,rows.filter(row=>row.P+row.TP+row.FA+row.U+row.Dup>0),c=>divide(c.TP,c.TP+c.FA+c.U+c.Dup));
  return{counts,recall,false_alarm_rate,precision,prevalence:divide(counts.P,counts.P+counts.D),noisy:options.split==='heldout'&&false_alarm_rate.value!==null&&false_alarm_rate.value>.20};
}
/** Family summaries remain rates, never a repository grade. */
export function familySummaries(rows:readonly CaseScore[],options:BootstrapOptions):{family:string;micro:MetricSummary;macro:{recall:number|null;false_alarm_rate:number|null;precision:number|null}}[]{
  const families=[...new Set(rows.map(row=>row.rule_id.split('.')[0]))];
  return families.map(family=>{const selected=rows.filter(row=>row.rule_id.startsWith(`${family}.`));const rules=[...new Set(selected.map(row=>row.rule_id))];const summaries=rules.map(rule=>summarize(selected.filter(row=>row.rule_id===rule),options));
    const mean=(key:'recall'|'false_alarm_rate'|'precision'):number|null=>{const values=summaries.map(s=>s[key].value).filter((v):v is number=>v!==null);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};return{family,micro:summarize(selected,options),macro:{recall:mean('recall'),false_alarm_rate:mean('false_alarm_rate'),precision:mean('precision')}};});
}
