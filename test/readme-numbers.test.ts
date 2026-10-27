import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import { inspectReadme,renderMeasurementBlock } from '../scripts/check-readme-numbers.ts';
import constants from '../config/readme-constants.json';

describe('README measurement provenance controls — authored, never run in Dirty Mode',()=>{
  const block=renderMeasurementBlock([]);
  const wrap=(body:string,design=constants.design_phrases.join('\n'))=>`# Demo\n${design}\n<!-- BEGIN MEASURED RESULTS -->\n${body}\n<!-- END MEASURED RESULTS -->\n`;
  it('accepts exact approved design phrases and the current unmeasured README',()=>{
    expect(inspectReadme(wrap(block),constants.design_phrases,block)).toEqual([]);
    const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');
    expect(inspectReadme(readme,constants.design_phrases,block)).toEqual([]);
  });
  it.each(['12% recall','0 false alarms','20% precision','5 measured findings','2,000 successful scans','recall12%','0false alarms'])('rejects measured use of an otherwise approved value: %s',claim=>{
    // what_bug_this_catches: a bare-number whitelist allowed invented measurements using design constants.
    expect(inspectReadme(wrap(block)+'\n'+claim,constants.design_phrases,block)).not.toEqual([]);
  });
  it('does not approve reworded numeric claims or a legacy bare-number configuration',()=>{
    expect(inspectReadme(wrap(block,'12 rules'),constants.design_phrases,block)).toContain('unapproved_numeric_claim:12');
    expect(inspectReadme(wrap(block),['12'],block)).toContain('invalid_readme_constants');
  });
  it('permits nonnumeric explanation of recall and false alarms outside the block',()=>{
    expect(inspectReadme(wrap(block)+'Recall and false alarms will be reported after authorized evaluation.',constants.design_phrases,block)).toEqual([]);
  });
  it('preserves exact design wording across Windows line endings',()=>{
    expect(inspectReadme(wrap(block).replace(/\n/g,'\r\n'),constants.design_phrases,block)).toEqual([]);
  });
  it('rejects invented measured text inside the generated block even when its numbers are design values',()=>{
    expect(inspectReadme(wrap('12% recall; 0 false alarms'),constants.design_phrases,block)).toContain('measurement_block_not_from_results');
  });
  it('accepts only the exact block rendered from result records',()=>{
    const measured=renderMeasurementBlock([{run_id:'unit',arm:'S44',split:'dev',cohort:'single',rule_id:'secrets.provider_key',summary:{recall:{value:0.5},false_alarm_rate:{value:0},precision:{value:1}}}]);
    expect(inspectReadme(wrap(measured),constants.design_phrases,measured)).toEqual([]);
    expect(inspectReadme(wrap(measured.replace('0.5000','0.6000')),constants.design_phrases,measured)).toContain('measurement_block_not_from_results');
  });
  it('rejects missing and repeated delimiters',()=>{
    expect(inspectReadme('# empty',[],block)).toContain('measurement_block_markers');
    expect(inspectReadme(wrap(block)+'<!-- BEGIN MEASURED RESULTS -->',constants.design_phrases,block)).toContain('measurement_block_markers');
  });
});
