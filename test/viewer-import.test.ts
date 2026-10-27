// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import example from '../src/viewer/demoReport.json';
import { importReport, MAX_REPORT_BYTES, IMPORT_LIMITS } from '../src/viewer/importReport.ts';
import { FindingsTable } from '../src/viewer/FindingsTable.tsx';

const fresh=()=>JSON.parse(JSON.stringify(example)) as typeof example;
describe('viewer import boundary — authored, never run in Dirty Mode',()=>{
  it('accepts the explicitly illustrative complete report shape',()=>{
    expect(importReport(JSON.stringify(example)).schema_version).toBe(1);
    expect(importReport(JSON.stringify(example)).results).toHaveLength(12);
  });
  it.each([
    ['rule_id','secrets.provider_key'],['state','flagged'],['severity_hint','medium'],
  ])('rejects non-string %s before enum comparison', (field, validValue)=>{
    // what_bug_this_catches: a single-element enum array passed coercive checks and crashed viewer rendering/search.
    for(const value of [[validValue],{value:validValue},{toString:validValue},null,1,true]){
      const input=fresh();
      // Keep all original rules present so completeness checks cannot hide enum-validation defects.
      const extra={...input.results[0],id:'f'.repeat(64),[field]:value};
      expect(()=>importReport(JSON.stringify({...input,results:[...input.results,extra]}))).toThrow('Report format is invalid or exceeds the supported bounds.');
    }
  });
  it.each([
    ['flagged',true],['present',false],['absent_in_scope',true],['absent_in_scope',false],['unknown',null],
  ])('accepts valid string state %s with concern %s',(state,concern)=>{
    const input=fresh();Object.assign(input.results[0],{state,concern});
    expect(importReport(JSON.stringify(input)).results[0].state).toBe(state);
  });
  it.each([['flagged',false],['present',true],['unknown',true],['absent_in_scope',null]])('rejects inconsistent %s concern %s',(state,concern)=>{
    const input=fresh();Object.assign(input.results[0],{state,concern});
    expect(()=>importReport(JSON.stringify(input))).toThrow();
  });
  it('rejects unsupported schemas, missing rules, unknown fields and concern inconsistencies',()=>{
    const version=fresh();version.schema_version=2;expect(()=>importReport(JSON.stringify(version))).toThrow();
    const missing=fresh();missing.results.pop();expect(()=>importReport(JSON.stringify(missing))).toThrow();
    expect(()=>importReport(JSON.stringify({...example,score:100}))).toThrow();
    const concern=fresh();concern.results[0].concern=null;expect(()=>importReport(JSON.stringify(concern))).toThrow();
    const duplicate=fresh();duplicate.results[1].id=duplicate.results[0].id;expect(()=>importReport(JSON.stringify(duplicate))).toThrow();
  });
  it('caps declared size, actual UTF-8 size, arrays and strings before rendering',()=>{
    expect(()=>importReport('{}',MAX_REPORT_BYTES+1)).toThrow('5 MiB');
    expect(()=>importReport('é'.repeat(Math.floor(MAX_REPORT_BYTES/2)+1))).toThrow('5 MiB');
    const text=fresh();text.results[0].message='x'.repeat(IMPORT_LIMITS.text+1);expect(()=>importReport(JSON.stringify(text))).toThrow();
    const paths=fresh();paths.scope.skipped_paths=Array.from({length:2001},()=>({path:'unit.ts',reason:'unit'})) as never[];expect(()=>importReport(JSON.stringify(paths))).toThrow();
    const evidence=fresh();evidence.results[0].evidence=Array.from({length:101},()=>({...evidence.results[0].evidence[0]}));expect(()=>importReport(JSON.stringify(evidence))).toThrow();
  });
  it('rejects invalid spans and non-integer or negative scope counts',()=>{
    const span=fresh();span.results[0].evidence[0].endLine=0;expect(()=>importReport(JSON.stringify(span))).toThrow();
    const scope=fresh();scope.scope.files_seen=-1;expect(()=>importReport(JSON.stringify(scope))).toThrow();
  });
  it('treats hostile text as text, without constructing images or data-derived links',()=>{
    const input=fresh();input.results[0].message='<img src=x onerror=alert(1)>';input.results[0].subject='[open](javascript:alert(1))';
    const report=importReport(JSON.stringify(input));
    const markup=renderToStaticMarkup(React.createElement(FindingsTable,{results:report.results}));
    expect(markup).toContain('&lt;img');expect(markup).not.toContain('<img');expect(markup).not.toContain('<a ');
  });
  it('masks provider-looking paths and escapes controls in arbitrary imported text',()=>{
    const key=['sk','-proj-'].join('')+'aB9cD2eF7gH4jK6mN8pQ3rS5tV1wX0yZ';
    const input=fresh();input.scope.root_label=key+'\u0001';
    const report=importReport(JSON.stringify(input));
    expect(report.scope.root_label).not.toContain(key);expect(report.scope.root_label).toContain('\\u{1}');
  });
  it('never quotes malformed JSON in the parse error',()=>{
    expect(()=>importReport('{malicious content')).toThrow('The selected file is not valid JSON.');
  });
});
