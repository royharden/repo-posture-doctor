import { digest, object } from './labels.ts';
import { validateLock } from './lock.ts';
import type { CorpusLock } from './lock.ts';
export interface Freeze {
  schema_version:1;g0:'GO';g1:'GO';product_commit:string;lockfile_sha256:string;config_sha256:string;rules_digest:string;matcher_sha256:string;mapping_sha256:string;
  b1_pin:string;gitleaks_pin:string;corpus_lock_sha256:string;
}
export interface ActualInputs extends Omit<Freeze,'schema_version'|'g0'|'g1'> { generator_sha256:string;corpus_sha256:string;labels_sha256:string;seed:number }
export function validateFreeze(input:unknown):Freeze {
  const f=object(input);
  if(f.schema_version!==1||f.g0!=='GO'||f.g1!=='GO'||typeof f.product_commit!=='string'||!/^[a-f0-9]{40,64}$/.test(f.product_commit)||
    !['lockfile_sha256','config_sha256','rules_digest','matcher_sha256','mapping_sha256','corpus_lock_sha256'].every(key=>digest(f[key]))||
    typeof f.b1_pin!=='string'||!/^[a-f0-9]{40,64}$/.test(f.b1_pin)||typeof f.gitleaks_pin!=='string'||!f.gitleaks_pin)throw new Error('invalid_freeze');
  return f as unknown as Freeze;
}
/** Inputs are hashes computed by the caller from actual bytes, never copied out of these records. */
export function assertHeldoutReady(lockInput:unknown,freezeInput:unknown,actual:ActualInputs):{lock:CorpusLock;freeze:Freeze}{
  const lock=validateLock(lockInput),freeze=validateFreeze(freezeInput);
  for(const key of ['product_commit','lockfile_sha256','config_sha256','rules_digest','matcher_sha256','mapping_sha256','b1_pin','gitleaks_pin','corpus_lock_sha256'] as const)if(freeze[key]!==actual[key])throw new Error('freeze_input_mismatch');
  for(const key of ['generator_sha256','corpus_sha256','labels_sha256','rules_digest','seed'] as const)if(lock[key]!==actual[key])throw new Error('corpus_lock_mismatch');
  return{lock,freeze};
}
