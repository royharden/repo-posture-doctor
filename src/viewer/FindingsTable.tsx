import type { RuleResult } from '../core/types.ts';
import { SeverityChip } from './SeverityChip.tsx';
export function FindingsTable({results}:{results:RuleResult[]}){
  if(!results.length)return <div className="empty-state"><h3>No observations match these filters.</h3><p>Try a different family, state or search term.</p></div>;
  return <div className="observations">{results.map(result=><article className="observation" key={result.id}><div className="observation-heading"><div><span className="rule-name">{result.rule_id}</span><h3>{result.subject==='root'?'Repository scope':result.subject}</h3></div><div className="chips"><span className={`chip state-${result.state}`}>{result.state.replaceAll('_',' ')}</span><SeverityChip value={result.severity_hint}/></div></div>
    <p>{result.message}</p><div className={`concern-line ${result.concern===true?'concern-yes':''}`}><span className="dot"/><strong>{result.concern===null?'Concern undetermined':result.concern?'Concerning observation':'No concerning observation'}</strong>{result.reason&&<code>{result.reason}</code>}</div>
    {result.evidence.map((pointer,index)=><div className="evidence" key={index}><div className="evidence-location"><span>Source pointer</span><code>{pointer.path}:{pointer.line}:{pointer.col}–{pointer.endLine}:{pointer.endCol}</code></div><pre><code>{pointer.excerpt}</code></pre></div>)}
    <details><summary>Interpretation &amp; rule coverage</summary><p><strong>Blind spot:</strong> {result.blind_spot}</p>{result.coverage&&<><p><strong>Required:</strong> {result.coverage.required.join(', ')}</p><p><strong>Examined:</strong> {result.coverage.examined.toLocaleString()}</p>{result.coverage.skipped.map((item,index)=><p key={index}><code>{item.reason}</code>: {item.count}</p>)}</>}</details>
  </article>)}</div>;
}
