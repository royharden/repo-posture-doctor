import type { SnapshotFile } from '../src/core/types.ts';
/** Demo only — never evaluated. Independent corpus content is never imported here. */
export function demoScaffold(): SnapshotFile[] {
  const alphabet = 'Az9Qm2Vx7Lp4Rs8Tn6Wc3Hd5Jk0Ef1Gy';
  const value = ['sk', '_li', 've_'].join('') + Array.from({length: 32}, (_,i)=>alphabet[(i * 11 + 7) % alphabet.length]).join('');
  const entries = [
    ['package.json', JSON.stringify({name:'demo-only-never-evaluated',private:true,scripts:{start:'node index.js'}})],
    ['src/index.ts', `const STRIPE_SECRET = "${value}";\ntry { work(); } catch { /* demo: silent */ }\n`],
    ['supabase/migrations/001_demo.sql', 'create table public.demo_entries (id integer);\n'],
    ['README.md', '# Demo only — never evaluated\nSynthetic builder scaffold. Not corpus, labels, or measured scan output.\n'],
  ];
  return entries.map(([path,content])=>({path: path!, content: content!, size: new TextEncoder().encode(content!).length,
    kind: path!.endsWith('.sql') ? 'sql' : path!.endsWith('.json') ? 'json' : path!.endsWith('.md') ? 'markdown' : 'source'}));
}
