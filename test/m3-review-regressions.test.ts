import { describe, expect, it, vi } from 'vitest';
import { scoreB1Cohort } from '../scripts/eval.ts';
import { assertActualHeldoutCounts, assertProductSourceClean } from '../scripts/gate-io.ts';
import { guardB1Output } from '../baselines/b1-vca13/adapter.ts';
import type { B1Output } from '../baselines/b1-vca13/adapter.ts';
import { RULE_IDS } from '../src/eval/labels.ts';
import type { Label, Manifest } from '../src/eval/labels.ts';
import type { CorpusLock } from '../src/eval/lock.ts';
import { assertHeldoutReady } from '../src/eval/freeze.ts';
import type { ActualInputs, Freeze } from '../src/eval/freeze.ts';
import { scoreCase } from '../src/eval/match.ts';
import { emptyScope } from '../src/core/scope.ts';
import type { Report } from '../src/core/types.ts';
import { DEFAULT_CONFIG } from '../src/core/config.ts';
import { createSnapshot } from '../src/core/snapshot.ts';
import { detectedSecretValues } from '../src/core/rules/secrets/index.ts';
import { findCandidates } from '../src/core/safe.ts';

// Builder hand-calculated scorer/gate controls only. Never corpus or evaluation inputs; not run in Dirty Mode.
const report: Report = { schema_version:1,tool_version:'control',rules_version:'control',scope:emptyScope('control'),results:[],not_checked:[] };
const label = (patch: Partial<Label> = {}): Label => ({case_id:'control-a',split:'heldout',cohort:'single',group_id:'control-group',rule_id:'tests.no_test_files',
  polarity:'positive',level:'repo',path:null,span:null,subject:'root',expected_state:'absent_in_scope',expected_concern:true,...patch});
const digest = 'a'.repeat(64); const commit = 'b'.repeat(40);
const emptyB1 = (location = '.env.example'): B1Output => ({results:[],findings:[{rule_id:'secrets.env_file_present',location}],unmapped:0,match_level:'path',partial_maps:['secrets.env_file_present']});

describe('M3 B1 non-applicable comparator cohort controls', () => {
  it.each([
    label(),
    label({cohort:'oos',rule_id:'secrets.*',level:'line',path:'src/a.ts',span:{startLine:1,startCol:1,endLine:1,endCol:4},subject:null,expected_state:'flagged'}),
  ])('keeps native scoring while skipping empty path/B1 cohorts for $cohort $rule_id', async item => {
    // what_bug_this_catches: scoreCase rejects empty labels; an N/A B1 cohort must not abort the complete runner.
    const baseline = vi.fn(async () => emptyB1()); const fallback = vi.fn(() => report);
    const native = scoreCase(item.case_id,[item],report);
    expect(native).toHaveLength(1);
    expect(await scoreB1Cohort(item.case_id,[item],report,baseline,fallback)).toEqual({s44:[],b1:[],unmapped:0});
    expect(baseline).not.toHaveBeenCalled(); expect(fallback).not.toHaveBeenCalled();
  });
});

describe('M3 frozen product source controls', () => {
  function git(tracked = '', untracked = '') {
    return vi.fn((args: string[]) => args[0] === 'rev-parse' ? commit : args[0] === 'diff' ? tracked : untracked);
  }
  it.each(['src/core/scan.ts','scripts/eval.ts','baselines/b1-vca13/adapter.ts'])('refuses tracked execution drift in %s', path => {
    // what_bug_this_catches: unchanged HEAD must not certify modified scanner, runner or baseline bytes.
    expect(() => assertProductSourceClean(commit,git(path+'\0'))).toThrow('frozen_product_source_drift');
  });
  it('refuses untracked executable inputs including ignored source names', () => {
    const read = git('', 'src/ignored-new.ts\0');
    expect(() => assertProductSourceClean(commit,read)).toThrow('frozen_product_source_drift');
    expect(read.mock.calls.find(([args]) => args[0] === 'ls-files')?.[0]).not.toContain('--exclude-standard');
  });
  it('allows named generated attempts then catches source drift on the prediction-time recheck', () => {
    const generated='results/HELDOUT-ATTEMPT.json\0results/.HELDOUT-ATTEMPT.json.control-a.tmp\0';
    expect(assertProductSourceClean(commit,git('',generated))).toBe(commit);
    expect(() => assertProductSourceClean(commit,git('scripts/eval.ts\0',generated))).toThrow('frozen_product_source_drift');
    expect(() => assertProductSourceClean(commit,git('',generated+'results/injected.ts\0'))).toThrow('frozen_product_source_drift');
  });
  it('refuses a different HEAD even when its working tree is clean', () => {
    expect(() => assertProductSourceClean('c'.repeat(40),git())).toThrow('frozen_product_commit_mismatch');
  });
});

const unknownRules = ['secrets.env_file_present','tests.no_test_files','tests.no_test_script','tests.runner_not_in_ci','obs.no_logging_library','rls.table_rls_not_enabled'];
function countControl() {
  const labels: Label[] = []; const counts: Manifest['counts'] = [];
  for (const [index,rule_id] of RULE_IDS.entries()) {
    for (const polarity of ['positive','decoy'] as const) {
      for (let i=0;i<30;i++) labels.push(label({case_id:`case-${index}-${polarity[0]}-${i}`,rule_id,polarity,group_id:`group-${index}-${polarity[0]}-${Math.floor(i/2)}`}));
      counts.push({rule_id,polarity,cases:polarity==='positive'?38:30,groups:polarity==='positive'?23:15});
    }
    if (unknownRules.includes(rule_id)) {
      for (let i=0;i<10;i++) labels.push(label({case_id:`case-${index}-u-${i}`,rule_id,polarity:'expected_unknown',group_id:`group-${index}-u-${i}`,expected_state:'unknown',expected_concern:null}));
      counts.push({rule_id,polarity:'expected_unknown',cases:10,groups:10});
    }
    for (let i=0;i<8;i++) labels.push(label({case_id:`scene-${i}`,rule_id,cohort:'scene',group_id:`scene-group-${i}`}));
  }
  for (const polarity of ['positive','decoy'] as const) {
    for (let i=0;i<20;i++) labels.push(label({case_id:`oos-${polarity[0]}-${i}`,rule_id:'secrets.*',cohort:'oos',polarity,group_id:`oos-group-${i%10}`}));
    counts.push({rule_id:'secrets.*',polarity,cases:20,groups:10});
  }
  // These objects exercise count reconciliation only; they are not delivered corpus manifests/labels.
  const manifest: Manifest = {schemaVersion:1,split:'heldout',seed:7,generatorSha:digest,licence:'MIT',rulesVersion:'control',rulesDigest:digest,recipes:[],cases:[],counts};
  const lock: CorpusLock = {schema_version:1,split:'heldout',seed:7,ca:'control-ca',cr:'control-cr',generator_sha256:digest,corpus_sha256:digest,labels_sha256:digest,rules_digest:digest,counts:counts.map(c=>({...c})),review_status:'PASS',unresolved_labels:0};
  return {lock,corpus:{manifest,labels}};
}
describe('M3 actual bound admission counts', () => {
  it('accepts matching recomputed counts with actual single-rule minima', () => {
    const control=countControl(); expect(() => assertActualHeldoutCounts(control.lock,control.corpus)).not.toThrow();
  });
  it('refuses a one-count mismatch even when all bound hashes match', () => {
    // what_bug_this_catches: a signed count claim independent of labels must not satisfy admission.
    const {lock,corpus}=countControl(); lock.counts[0]!.cases++;
    const actual: ActualInputs = {product_commit:commit,lockfile_sha256:digest,config_sha256:digest,rules_digest:digest,matcher_sha256:digest,mapping_sha256:digest,b1_pin:commit,gitleaks_pin:'control',corpus_lock_sha256:digest,generator_sha256:digest,corpus_sha256:digest,labels_sha256:digest,seed:7};
    const freeze: Freeze = {schema_version:1,g0:'GO',g1:'GO',...actual};
    expect(() => assertHeldoutReady(lock,freeze,actual)).not.toThrow();
    expect(() => assertActualHeldoutCounts(lock,corpus)).toThrow('lock_actual_counts_mismatch');
  });
  it('does not let scenes pad the single-rule minimum while aggregate counts remain identical', () => {
    const {lock,corpus}=countControl();
    corpus.labels.find(item=>item.rule_id===RULE_IDS[0]&&item.cohort==='single'&&item.polarity==='positive')!.cohort='scene';
    expect(() => assertActualHeldoutCounts(lock,corpus)).toThrow('insufficient_actual_heldout_counts');
  });
  it('enforces actual required unknown counts in the single cohort', () => {
    const {lock,corpus}=countControl();
    corpus.labels.find(item=>item.rule_id==='secrets.env_file_present'&&item.polarity==='expected_unknown')!.cohort='scene';
    expect(() => assertActualHeldoutCounts(lock,corpus)).toThrow('insufficient_actual_unknown_counts');
  });
});

describe('M3 B1 guard membership', () => {
  it('does not guard placeholder candidates or reject the public env-template path', () => {
    // what_bug_this_catches: an unfiltered password candidate wrongly guarded the public substring exampl.
    const value=['exa','mple'].join('').repeat(5);
    const content=`password = "${value}"`;
    expect(findCandidates(content).some(candidate=>candidate.kind==='assignment')).toBe(true);
    const snapshot=createSnapshot('control',[{path:'.env.example',kind:'env',size:content.length,content}]);
    const detected=detectedSecretValues(snapshot,DEFAULT_CONFIG);
    expect(detected).toEqual([]);
    expect(() => guardB1Output(emptyB1(),[],detected)).not.toThrow();
  });
  it('still rejects leaked windows from actual detections and separately supplied planted values', () => {
    const alphabet='q7Zm2Pv9Na4Rx6Kc3Tj8Ws5Hy1Bd0Lf';
    const body=Array.from({length:45},(_,i)=>alphabet[i*11%alphabet.length]).join('');
    const content=`const apiKey = "${body}";`;
    const snapshot=createSnapshot('control',[{path:'src/a.ts',kind:'source',size:content.length,content}]);
    const detected=detectedSecretValues(snapshot,DEFAULT_CONFIG);
    expect(detected).toContain(body);
    expect(() => guardB1Output(emptyB1(body.slice(4,10)),[],detected)).toThrow('leak_guard_failure');
    expect(() => guardB1Output(emptyB1(body.slice(4,10)),[body],[])).toThrow('leak_guard_failure');
  });
});
