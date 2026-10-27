import { digest, object, RULE_IDS } from './labels.ts';
import type { Manifest } from './labels.ts';
export interface CorpusLock {
  schema_version:1;split:'heldout';seed:number;ca:string;cr:string;generator_sha256:string;corpus_sha256:string;labels_sha256:string;rules_digest:string;
  counts:Manifest['counts'];review_status:'PASS';unresolved_labels:0;
}
export function validateLock(input:unknown):CorpusLock {
  const l=object(input);
  if(l.schema_version!==1||l.split!=='heldout'||!Number.isSafeInteger(l.seed)||typeof l.ca!=='string'||!l.ca||typeof l.cr!=='string'||!l.cr||l.ca===l.cr||
    !['generator_sha256','corpus_sha256','labels_sha256','rules_digest'].every(key=>digest(l[key]))||l.review_status!=='PASS'||l.unresolved_labels!==0||!Array.isArray(l.counts))throw new Error('invalid_corpus_lock');
  for(const raw of l.counts){const c=object(raw);if(typeof c.rule_id!=='string'||!['positive','decoy','expected_unknown'].includes(String(c.polarity))||!Number.isSafeInteger(c.cases)||Number(c.cases)<0||!Number.isSafeInteger(c.groups)||Number(c.groups)<0)throw new Error('invalid_lock_counts');}
  const counts=l.counts as Manifest['counts'];const keys=new Set<string>();
  for(const count of counts){const key=`${count.rule_id}|${count.polarity}`;if(keys.has(key))throw new Error('duplicate_lock_count');keys.add(key);}
  for(const rule of RULE_IDS)for(const polarity of ['positive','decoy'] as const){const count=counts.find(item=>item.rule_id===rule&&item.polarity===polarity);if(!count||count.cases<30||count.groups<15)throw new Error('insufficient_heldout_counts');}
  for(const rule of ['secrets.env_file_present','tests.no_test_files','tests.no_test_script','tests.runner_not_in_ci','obs.no_logging_library','rls.table_rls_not_enabled']){const count=counts.find(item=>item.rule_id===rule&&item.polarity==='expected_unknown');if(!count||count.cases<10)throw new Error('insufficient_unknown_counts');}
  return l as unknown as CorpusLock;
}
export function assertDifferentRecipes(dev:Manifest,heldout:Manifest):void {
  if(dev.split!=='dev'||heldout.split!=='heldout')throw new Error('invalid_split_pair');
  const hashes=new Set(dev.recipes.map(recipe=>recipe.recipe_hash));
  if(heldout.recipes.some(recipe=>hashes.has(recipe.recipe_hash)))throw new Error('cross_split_recipe_overlap');
}
