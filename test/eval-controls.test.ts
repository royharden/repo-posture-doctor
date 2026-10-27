import { describe, expect, it } from 'vitest';
import type { Report, RuleResult } from '../src/core/types.ts';
import { emptyScope } from '../src/core/scope.ts';
import type { Label } from '../src/eval/labels.ts';
import { validateLabels, validateCases } from '../src/eval/labels.ts';
import { scoreCase } from '../src/eval/match.ts';
import { summarize } from '../src/eval/metrics.ts';
import { compareArms } from '../src/eval/compare.ts';
import { validateFreeze } from '../src/eval/freeze.ts';

// Hand-calculated scorer controls only. Never corpus or externally supplied gold data.
const label=(patch:Partial<Label>={}):Label=>({case_id:'control-a',split:'dev',cohort:'single',group_id:'unit-control',rule_id:'obs.empty_catch',polarity:'positive',level:'line',path:'src/a.ts',span:{startLine:1,startCol:1,endLine:1,endCol:4},subject:null,expected_state:'flagged',expected_concern:true,...patch});
const result=(patch:Partial<RuleResult>={}):RuleResult=>({rule_id:'obs.empty_catch',family:'obs',subject:'src/a.ts:1:1-1:4',state:'flagged',concern:true,severity_hint:'medium',evidence:[{kind:'file:line',path:'src/a.ts',line:1,col:1,endLine:1,endCol:4,excerpt:'unit control'}],message:'unit control',blind_spot:'unit control',id:'control-id',...patch});
const report=(results:RuleResult[],patch:Partial<Report['scope']>={}):Report=>({schema_version:1,tool_version:'unit-control',rules_version:'unit-control',scope:{...emptyScope('unit-control'),...patch},results,not_checked:[]});
const unknown=(rule_id='obs.empty_catch'):RuleResult=>result({rule_id,subject:'root',state:'unknown',concern:null,evidence:[]});

describe('hand-calculated scorer controls — authored, not executed',()=>{
  it('counts one TP and a duplicate prediction, reducing precision to one half',()=>{
    const rows=scoreCase('control-a',[label()],report([result(),result({id:'duplicate'})]));
    expect(rows[0]).toMatchObject({P:1,TP:1,FN:0,Dup:1});
    expect(summarize(rows,{split:'dev',cohort:'single',seed:7}).precision.value).toBe(.5);
  });
  it('keeps positive hard errors in the denominator and counts them FN',()=>{
    expect(scoreCase('control-a',[label()],null)[0]).toMatchObject({P:1,TP:0,FN:1,errors:1});
  });
  it('uses unknown path evidence for positive and decoy abstentions',()=>{
    const r=report([unknown()],{skipped_paths:[{path:'src/a.ts',reason:'binary'}]});
    expect(scoreCase('control-a',[label()],r)[0]).toMatchObject({FN:1,abstained_positives:1});
    const d=label({polarity:'decoy',expected_state:null,expected_concern:false});
    expect(scoreCase('control-a',[d],r)[0]).toMatchObject({D:1,TN:0,abstained_decoys:1});
  });
  it('scores line and file expected-unknown correctly and separately records missed unknown',()=>{
    for(const file of [false,true]){
      const rule_id=file?'secrets.env_file_present':'obs.empty_catch';
      const l=label({rule_id,level:file?'file':'line',span:null,polarity:'expected_unknown',expected_state:'unknown',expected_concern:null});
      expect(scoreCase('control-a',[l],report([unknown(rule_id)],{skipped_paths:[{path:'src/a.ts',reason:'file_size_limit'}]}))[0].correct_unknown).toBe(1);
      expect(scoreCase('control-a',[l],report([unknown(rule_id)]))[0].missed_unknown).toBe(1);
      expect(scoreCase('control-a',[l],report([unknown(rule_id)],{inventory_complete:false}))[0].correct_unknown).toBe(1);
    }
  });
  it('uses missing-subject root unknown for both table and policy; present subjects overclaim',()=>{
    for(const policy of [false,true]){
      const rule_id=policy?'rls.literal_true_write_policy':'rls.table_rls_not_enabled';
      const subject=policy?'policy:public.items.write':'table:public.items';
      const l=label({rule_id,level:policy?'policy':'table',subject,path:null,span:null,polarity:'expected_unknown',expected_state:'unknown',expected_concern:null});
      expect(scoreCase('control-a',[l],report([unknown(rule_id)]))[0].correct_unknown).toBe(1);
      expect(scoreCase('control-a',[l],report([result({rule_id,subject,state:'present',concern:false,evidence:[]})]))[0].overclaimed_present).toBe(1);
      expect(scoreCase('control-a',[l],report([]))[0].missed_unknown).toBe(1);
    }
  });
  it('counts an unplanned scene concern while excluding non-concerning summaries',()=>{
    const rows=scoreCase('control-a',[label({cohort:'scene'})],report([result(),result({subject:'src/b.ts:1:1-1:4',evidence:[{...result().evidence[0],path:'src/b.ts'}]}),result({subject:'root',concern:false,state:'absent_in_scope',evidence:[]})]));
    expect(rows[0]).toMatchObject({TP:1,U:1,Dup:0});
  });
  it('returns null for empty denominators and refuses unpaired contrasts',()=>{
    const rows=scoreCase('control-a',[label({polarity:'decoy',expected_state:null,expected_concern:false})],report([]));
    const summary=summarize(rows,{split:'dev',cohort:'single',seed:1});
    expect(summary.recall.value).toBeNull();expect(summary.recall.wilson).toBeNull();
    expect(summary.recall.bootstrap).toMatchObject({groups:0,valid:0,undefined:2000});
    expect(()=>compareArms(rows,[],{split:'dev',cohort:'single',seed:1})).toThrow('paired_cohort_mismatch');
  });
  it('validates data shape and blocks incomplete freeze records',()=>{
    expect(validateLabels([label()])).toHaveLength(1);
    expect(()=>validateCases([{case_id:'control-a',files:[{path:'../escape.ts',content:'unit'}]}])).toThrow();
    expect(()=>validateFreeze({schema_version:1,g0:'PENDING',g1:'GO'})).toThrow();
  });
});
