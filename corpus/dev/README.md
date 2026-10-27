# corpus/dev

**Empty until the corpus author (CA) delivers the dev split after G0 GO.** The builder lineage never writes files here.

Contents when delivered: CA's dev generator module implementing `generate(seed, 'dev')` per `docs/CORPUS-API.md`, its labels and
manifest. Tracked sources hold fragment arrays and seeded-`Rng` code only; materialized cases (with fake secrets) go to the
gitignored `corpus/.out/dev/` via `npm run materialize`.
