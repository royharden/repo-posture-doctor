import { parseArguments, loadCorpus, materialize, jsonHash } from './corpus-io.ts';
import { admission, preflightHeldout, heldoutBindings } from './gate-io.ts';
try {
  const options=parseArguments(process.argv.slice(2)); await admission(options.split);
  if(options.split==='heldout')await preflightHeldout();
  const first=await loadCorpus(options.split,options.seed);
  if(options.split==='heldout')await heldoutBindings(first);
  if(options.check){const second=await loadCorpus(options.split,options.seed);
    if(jsonHash(first)!==jsonHash(second))throw new Error('corpus_not_reproducible');
    console.log('Independent corpus hashes and reproducibility checked. No scanner predictions made.');
  }else{await materialize(first,options.split);console.log('Independent corpus materialized inside corpus/.out/.');}
}catch{console.error('materialization_refused: check independent admission, corpus, lock/freeze bindings, seed and fresh output');process.exitCode=2;}
