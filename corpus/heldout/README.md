# corpus/heldout

**Empty until release.** The held-out split is written by the corpus author (CA) into the outer shell's sealed custody folder,
reviewed by CR, and copied here by INT only after `corpus/heldout.lock.json` and `results/FREEZE.json` are both committed
([C] §6.3). The builder lineage never reads the custody folder and never writes files here.

`corpus/heldout.lock.json` is **absent** at this stage. When committed it records the seed, CA and CR callsigns, the sha256 of CA's
source tree, the materialized corpus and the labels, and counts per rule, polarity and group. After release,
`npm run materialize -- --check` must reproduce every lock hash before `npm run eval -- --split heldout` may run, and that run is
used once.
