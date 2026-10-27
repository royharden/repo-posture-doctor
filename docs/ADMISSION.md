# Data admission record (G0 and G1)

**Status: PENDING — needs Roy to appoint CA/CR (ROY-D1).** No pilot, catalogue, corpus or gate decision exists. This file is a
template that INT fills. Construction is proceeding against rule cards v1.0-draft under Dirty Mode by Roy's 2026-10-27 launch
instruction (PLAN.md K13, ROY-D2); no measurement, freeze or held-out work happens before G0 and G1 are both GO.

Sources: [C] §6.5 (Stage A pilot, Stage B definitive gate), PLAN.md K12 (G0 = Stage A + Stage B; G1 from [X] re-confirms on the
complete corpus before `FREEZE.json`).

## Roles (B3)

| Role | Callsign | Registry id | Model family | Appointed by / date | Attests no access to `src/` |
|---|---|---|---|---|---|
| Builder | 0804_Claude_Opus55_S44INT lineage | | Claude | Roy (S44 launch, 2026-10-27) | n/a |
| Corpus author (CA) | | | _(must differ from Claude)_ | | |
| Corpus reviewer (CR) | | | _(distinct from builder and CA)_ | | |
| Execution lead (INT) | 0804_Claude_Opus55_S44INT | | Claude | | n/a |

## G0 — Stage A: exploratory specification pilot

May revise the cards; may not shrink scope. CA writes 5 positive + 5 decoy snippets per rule from the cards alone; CR labels them
blind. Below 9/10 on a rule: the card is clarified as a new version (reason recorded) and the rule is re-piloted. Pilot snippets
are discarded and never used as dev or held-out.

| Rule | Card version piloted | CR agreement (/10) | Revised? (new version, reason) | Final card version |
|---|---|---|---|---|
| `secrets.provider_key` | v1.0-draft | | | |
| `secrets.service_role_jwt` | v1.0-draft | | | |
| `secrets.secret_assignment` | v1.0-draft | | | |
| `secrets.env_file_present` | v1.0-draft | | | |
| `secrets.public_prefixed_secret` | v1.0-draft | | | |
| `rls.table_rls_not_enabled` | v1.0-draft | | | |
| `rls.literal_true_write_policy` | v1.0-draft | | | |
| `tests.no_test_files` | v1.0-draft | | | |
| `tests.no_test_script` | v1.0-draft | | | |
| `tests.runner_not_in_ci` | v1.0-draft | | | |
| `obs.empty_catch` | v1.0-draft | | | |
| `obs.no_logging_library` | v1.0-draft | | | |

Interpretation notes confirmed or revised (from `docs/RULES.md`): _(empty — in particular the UUID exclusion, the PEM boundary,
the denied-folder scope note and the span convention)_

Final card digest (v1.x): _(empty)_

## G0 — Stage B: definitive gate (fixed scope: the 12 rules of card version v1.x)

GO only if every item holds.

| Item | Requirement | Result | Evidence |
|---|---|---|---|
| B1 crispness | every rule passed Stage A at ≥ 9/10 on its final card | | |
| B2 recipe catalogue | complete for both splits: group lists meeting the minimums (`docs/EVAL-PROTOCOL.md` §7.0), decoy classes per rule, OOS plan, scene list, normalized-recipe disjointness check | | |
| B3 independence | CA/CR callsigns, registry ids and families recorded; CA ≠ builder family; three distinct agents; CA and CR attest no `src/` access | | |
| B4 rights and hygiene | CA originality attestation; `check-no-secret-literals` passes on all CA material; INT accepts the [C] §6.1 licence list and Roy's #13 authorization record | | |

**G0 decision:** _(GO / NO-GO — empty)_ · signed by INT: _(empty)_ · date: _(empty)_

Any item fails → **NO-GO**: S44 is skipped in execution and reported visibly; it is not built against a smaller or easier scope.

## G1 — full-corpus confirmation (before `FREEZE.json`)

| Item | Requirement | Result | Evidence |
|---|---|---|---|
| Counts | actual counts and group membership meet the minimums per rule and polarity, incl. ≥ 10 expected-`unknown` per repo-level rule and RLS tables | | |
| Disjointness | no cross-split normalized-recipe duplicates | | |
| Labels | spans/subjects verified against `docs/CORPUS-API.md`; every recipe, decoy and expected-`unknown` reason has a CR disposition | | |
| Blind sample | CR blind-labelled 5 emitted cases per held-out group; disagreements resolved by INT against the card, originals kept | | |
| Reproduction | `materialize --check` reproduces dev and lock hashes, run twice by INT | | |
| Lock | `corpus/heldout.lock.json` committed (seed, CA/CR callsigns, sha256 of CA source tree, materialized corpus, labels; counts) | | |
| Hygiene | literal sweep clean on all corpus sources | | |

**G1 decision:** _(GO / NO-GO — empty)_ · signed by INT and CR: _(empty)_ · date: _(empty)_

G1 failure skips empirical execution and acceptance visibly; no easier corpus or selective rule withdrawal replaces it.


## Codex succession — 2026-10-27
The builder lineage now includes both Claude and Codex (S44-CODEX-INT 0867). Any earlier statement that the builder is Claude only, or a Codex CA is independent, is superseded. CA must be appointed by Roy outside both builder families/lineages; CR is separately appointed. Status: PENDING — needs Roy to appoint. No corpus or measurements are authorized by this note.
