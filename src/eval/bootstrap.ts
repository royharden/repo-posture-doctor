// Adapted group-bootstrap design from S26 (MIT), commit e971a5622947144d51f1fd5b7ca553bbf27e1a95.
// Copyright (c) S26 contributors. Permission is granted under the MIT notice in src/shared/vendored/VENDORED.md.
import { createRng } from '../shared/vendored/rng.ts';
import type { Interval } from '../shared/vendored/types.ts';
import type { Cohort, Split } from './labels.ts';
export const RESAMPLES = 2_000;
export interface BootstrapResult { interval: Interval|null; groups:number; valid:number; undefined:number; resamples:number; label:string; reason:string|null }
export interface BootstrapOptions { split:Split;cohort:Cohort;seed:number }
export function groupBootstrap<T extends { group_id:string }>(rows:readonly T[], statistic:(sample:readonly T[])=>number|null, options:BootstrapOptions):BootstrapResult {
  const grouped = new Map<string,T[]>();
  for (const row of rows) { const group=grouped.get(row.group_id) ?? [];group.push(row);grouped.set(row.group_id,group); }
  const groups=[...grouped.keys()].sort(); const rng=createRng(options.seed);const draws:number[]=[];
  for(let draw=0;draw<RESAMPLES;draw+=1){
    const sample:T[]=[];
    for(let i=0;i<groups.length;i+=1) sample.push(...grouped.get(groups[rng.int(0,groups.length)])!);
    const value=statistic(sample);if(value!==null && Number.isFinite(value))draws.push(value);
  }
  draws.sort((a,b)=>a-b);
  const exploratory=options.cohort!=='single';const threshold=options.split==='heldout'?15:10;
  const reason=groups.length===0?'no_groups':!exploratory&&groups.length<threshold?'insufficient_groups':draws.length<1_900?'insufficient_valid_draws':null;
  const quantile=(p:number):number=>{const position=(draws.length-1)*p;const low=Math.floor(position),high=Math.ceil(position);return draws[low]+(draws[high]-draws[low])*(position-low);};
  return { interval:reason?null:{low:quantile(.025),high:quantile(.975)},groups:groups.length,valid:draws.length,undefined:RESAMPLES-draws.length,resamples:RESAMPLES,
    label:exploratory?`exploratory (${groups.length} groups)`:options.split==='dev'?'dev — diagnostic':'held-out',reason };
}
