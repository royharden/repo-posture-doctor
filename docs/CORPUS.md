# Corpus

**Status: no corpus exists yet.** The corpus author (CA) and corpus reviewer (CR) are not appointed (ROY-D1). The builder lineage
writes no corpus, labels, pilot snippets or expected answers (PLAN.md §2).

## What the corpus is
- **All content is original synthetic text**, written by CA from the rule cards (`docs/RULES.md`) for S44, and reviewed by CR.
- Two splits from **disjoint recipes**: `dev` (delivered to `corpus/dev/` after G0 GO) and `heldout` (kept in the outer shell's
  sealed custody folder until INT releases it into `corpus/heldout/` after the freeze).
- Three cohorts, never pooled: `single` (scored on its own rule), `scene` (exhaustively labelled across all 12 rules) and `oos`
  (credentials of formats S44 does not target plus benign look-alikes; exploratory).
- Minimum sizes: `docs/EVAL-PROTOCOL.md` §7.0. Contract (generator, cases, labels, span convention, manifest, materialization):
  `docs/CORPUS-API.md`.
- Fake secrets exist only in bytes materialized under the gitignored `corpus/.out/`. Tracked corpus sources hold fragment arrays and
  seeded-`Rng` code only.

## Sources and licences ([C] §6.1)
- No third-party code or data is copied. Read for ideas only: vibeshield (MIT), aislop (MIT), Scorecard (Apache-2.0).
- Not used: trufflehog (AGPL-3.0), OWASP Benchmark (GPL-2.0), vibeaudit (no licence), semgrep-rules (NOASSERTION); CredData and
  SecretBench are deferred pending a rights review.

## Attestations (filled by CA and CR; empty until appointment)

### CA — originality and licence
- CA callsign / registry id / model family: _(empty)_
- I wrote every corpus file myself from `docs/RULES.md` (card version: _(empty)_, digest: _(empty)_). No string was copied from any
  external source; every secret body comes from the vendored seeded `Rng`; provider prefixes and PEM markers are fragment arrays.
  _(signature: empty)_
- I release the corpus content (both splits, the OOS cohort and the scenes) under this repository's MIT licence. _(signature: empty)_
- I did not read `src/` (other than `src/shared/vendored/rng.ts`), `baselines/` or `scripts/`, and never ran or observed any
  detector. _(signature: empty)_
- `scripts/check-no-secret-literals.ts` result on my material: _(empty)_

### CR — independence and review
- CR callsign / registry id / model family: _(empty)_
- I am distinct from the builder lineage and from CA. I did not read `src/`, `baselines/` or `scripts/`. I labelled pilot snippets
  and sampled cases blind before seeing CA's labels. _(signature: empty)_
- `CR-REPORT.md` location and digest: _(empty)_

## Delivery record (filled by INT)

| Item | Date | Digest | Notes |
|---|---|---|---|
| Recipe catalogue (G0 B2) | | | |
| Dev split → `corpus/dev/` | | | |
| Held-out split → custody | | | |
| `corpus/heldout.lock.json` committed | | | |
| Held-out released → `corpus/heldout/` | | | |
