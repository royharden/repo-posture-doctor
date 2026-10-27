import { groupBootstrap } from './bootstrap.ts';
import type { BootstrapOptions } from './bootstrap.ts';
import { aggregate } from './metrics.ts';
import type { CaseScore } from './match.ts';
/** Case identity and scenario group must agree; absent/failed cases cannot be silently discarded. */
export function compareArms(left:readonly CaseScore[],right:readonly CaseScore[],options:BootstrapOptions){
  const key=(row:CaseScore):string=>`${row.case_id}|${row.rule_id}|${row.cohort}|${row.match_level}`;
  const rightMap=new Map(right.map(row=>[key(row),row]));
  if(rightMap.size!==right.length||new Set(left.map(key)).size!==left.length||left.length!==right.length)throw new Error('paired_cohort_mismatch');
  const paired=left.map(l=>{const r=rightMap.get(key(l));if(!r||l.group_id!==r.group_id||l.P!==r.P||l.D!==r.D||l.split!==r.split)throw new Error('paired_cohort_mismatch');return{group_id:l.group_id,left:l,right:r};});
  const difference=(sample:readonly typeof paired[number][],rate:'recall'|'false_alarm_rate'):number|null=>{const l=aggregate(sample.map(p=>p.left)),r=aggregate(sample.map(p=>p.right));const ld=rate==='recall'?l.P:l.D-l.abstained_decoys,rd=rate==='recall'?r.P:r.D-r.abstained_decoys;return ld>0&&rd>0?(rate==='recall'?l.TP:l.decoy_FA)/ld-(rate==='recall'?r.TP:r.decoy_FA)/rd:null;};
  return{recall:{difference:difference(paired,'recall'),bootstrap:groupBootstrap(paired.filter(p=>p.left.P>0),s=>difference(s,'recall'),options)},false_alarm_rate:{difference:difference(paired,'false_alarm_rate'),bootstrap:groupBootstrap(paired.filter(p=>p.left.D>0),s=>difference(s,'false_alarm_rate'),options)}};
}
