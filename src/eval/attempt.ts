import { open, link, rename, lstat } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { object, digest } from './labels.ts';
export interface AttemptReceipt { schema_version:1;attempt:1;attempt_id:string;started_at:string;inputs:{freeze_sha256:string;corpus_lock_sha256:string;corpus_sha256:string;labels_sha256:string;product_commit:string} }
export function validateAttempt(value:unknown):AttemptReceipt{
  const r=object(value),inputs=object(r.inputs);
  if(r.schema_version!==1||r.attempt!==1||typeof r.attempt_id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(r.attempt_id)||typeof r.started_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(r.started_at)||
    !['freeze_sha256','corpus_lock_sha256','corpus_sha256','labels_sha256'].every(key=>digest(inputs[key]))||typeof inputs.product_commit!=='string'||!/^[a-f0-9]{40,64}$/.test(inputs.product_commit))throw new Error('invalid_attempt_receipt');
  return r as unknown as AttemptReceipt;
}
/** Durable one-use claim: an exclusive hard link reserves the final name before atomic rename.
 * Existing final/temp files are never removed or overwritten on refusal; an interrupted attempt remains consumed.
 * No predictions may execute until this promise resolves. This function is source-only until Dirty Mode closes.
 */
export async function beginAttempt(path:string,input:AttemptReceipt):Promise<void>{
  const receipt=validateAttempt(input);const parent=await lstat(dirname(path));
  if(!parent.isDirectory()||parent.isSymbolicLink())throw new Error('invalid_attempt_directory');
  const temporary=join(dirname(path),`.${basename(path)}.${receipt.attempt_id}.tmp`);
  const handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(`${JSON.stringify(receipt,null,2)}\n`,'utf8');await handle.sync();}finally{await handle.close();}
  // link() fails with EEXIST if any previous run claimed the final record. No check-then-write race.
  try{await link(temporary,path);}catch{throw new Error('heldout_attempt_already_claimed_or_unavailable');}
  // Both names already contain the complete same bytes. Rename removes the temp name atomically where supported.
  // Windows may refuse replacing a hard-link alias; retaining both names still preserves the consumed final claim.
  try{await rename(temporary,path);}catch{/* The final exclusive claim remains complete and durable. */}
}
