# Preregistered evaluation protocol (v1.0-draft)

A copy of [C] §7 (`planning/PLAN-FINAL.Claude.0784_Claude_Opus55_N20PlanS44.md`, outer shell) with the PLAN.md r6 amendments
written in: §3a (results, subjects, states), §3b (masking, span convention, leak guard), §3c (label `subject`, join, predictions,
expected-`unknown`), K14 (corpus sizes), K15 (bootstrap stability), K18 (gitleaks flags), K23 (precision notation), K24 (B0 for
`service_role_jwt` and the OOS B0 row) and K25 (B1 env mapping). Amended passages are marked **[A]**; struck [C] text is noted.
Nothing has been measured; before the one held-out run every cell reads "not yet measured".

## 7.0 Corpus sizes (K14) [A]

- **Held-out, per rule:** ≥ 30 positive and ≥ 30 decoy cases from ≥ 15 scenario groups per polarity, plus **≥ 10 expected-`unknown`
  labels per rule** for `secrets.env_file_present`, `tests.no_test_files`, `tests.no_test_script`, `tests.runner_not_in_ci`,
  `obs.no_logging_library`, and ≥ 10 RLS table labels (`rls.table_rls_not_enabled`). An `env_file_present` cap-hit label is written
  by path (`subject: null`).
- **Dev, per rule:** ≥ 20 positive and ≥ 20 decoy cases from ≥ 10 groups.
- **OOS cohort ([X] shape):** 20 intended credentials (unlisted formats, neutral names) + 20 benign look-alikes, from ≥ 10 groups.
- **Interaction scenes:** 8 dev and 8 held-out, exhaustively labelled across all 12 rules.

## 7.1 Units, cohorts and matching

- **Unit [A]:** `(case_id, rule_id, subject)`. Subjects (PLAN.md §3a): a line-level finding is
  `<maskedPath>:<startLine>:<startCol>-<endLine>:<endCol>`; an `env_file_present` finding is `<maskedPath>`; RLS uses
  `table:<schema>.<name>` and `policy:<schema>.<table>.<policyName>`; repo-level rules and every rule summary use `root`.
  (Struck: [C]'s "`table` for RLS" — the policy rule now has its own `policy:` unit.)
- **Cohorts, never pooled with each other:**
  - **single** (each case scored on its own rule only; all 12 rules run);
  - **scene** (all rules);
  - **oos** (exploratory).
- **Normalisation [A]:** the matcher maps every label path through the same `/`-normalisation and `toSafe()` masking as the scanner
  before comparing.
- **Native match [A].**
  - Line-level: (case, rule, masked path, overlapping span: same file and the closed `[startLine:startCol, endLine:endCol]` intervals
    intersect). `env_file_present`: (case, rule, masked path). RLS and repo-level: (case, rule, exact `subject`).
  - Each gold item matches at most once. A further prediction on the same subject is `duplicate`.
- **What counts as a prediction [A]:** only results with `concern === true`. Non-concerning results (`present`, `absent_in_scope`
  with concern false, including every `root` summary and per-table `present`) are never predictions and never unplanned FPs; they
  only serve state accounting for repo-level, RLS and expected-`unknown` labels.
- **Abstention [A]:** an `unknown` result with the label's exact subject (RLS, repo-level), or — for line-level/file labels — the
  label's masked path appearing in `scope.skipped_paths` (the sole path-level source; `coverage.skipped` holds counts only).
- **Path-level match:**
  - Used for the B1 comparison, because #13 findings carry no line numbers (`location: file.path` only).
  - Join on (case, mapped rule, masked path) only. S44 also gets a path-level row on the same cohort for a like-for-like comparison.
- **State accounting:**
  - **Expected positive:** `flagged` or `absent_in_scope` with `concern = true` is TP. Anything else is FN. If the prediction was
    `unknown`, it is also counted as an abstention.
  - **Expected decoy:** a concerning prediction is FA. `unknown` is an abstention, never TN. Otherwise TN.
  - **Expected `unknown` [A] (amends [C] §7.1):**
    - *Repo-level and RLS (subject labels):* correct if the result with that exact subject has `state: unknown`; for an RLS table
      label with **no** subject result, correct if the rule's `root` summary is `unknown`. `absent_in_scope` → FA; `present` →
      "overclaimed present" (counted separately); a concerning result → FA.
    - *Line-level and file labels (`subject: null`, including `env_file_present` cap-hit labels):* correct if that rule's `root`
      summary is `unknown` **and** the label's masked path either appears in `scope.skipped_paths` or was never inventoried
      (`inventory_complete: false` and no result or `skipped_paths` entry names it). FA if a concerning result matches it by the
      native join. Otherwise "missed unknown" (counted separately).
  - **Unlabelled predictions:**
    - in scenes, FP (`unplanned`, U);
    - in single-rule cases, ignored for other rules by construction.
  - **Hard errors** count as failed cases. Positives stay FN. No case is ever dropped from a denominator.
- **Scorer controls [A]:** hand-calculated tests cover duplicate, empty denominator, unknown on positive, unknown on decoy,
  expected-unknown (including one line-level and one file-level expected-`unknown` label in both the correct and the "missed
  unknown" outcome) and an unplanned scene finding. Their fixtures live under `test/` only, never `corpus/`.

## 7.2 Arms and baselines

- **S44** at the frozen config.
- **B0 (non-model, naive, one per rule, written before dev tuning and frozen):**

  | Rule | B0 |
  |---|---|
  | `provider_key` | prefixes without boundaries or placeholder filtering |
  | `service_role_jwt` | any `eyJ…\.eyJ…` (K24: kept as a format-shape floor) |
  | `secret_assignment` | `(?i)(secret\|token\|key\|password)\w*\s*[:=]\s*['"][^'"]{8,}['"]` |
  | `env_file_present` | any path matching `.env` |
  | `public_prefixed_secret` | any `VITE_`/`NEXT_PUBLIC_` name containing `KEY` |
  | `rls.table_rls_not_enabled` | a `create table` in a file lacking the string `row level security` |
  | `rls.literal_true_write_policy` | any `using (true)` |
  | `tests.no_test_files` | no path containing `test` |
  | `tests.no_test_script` | no `"test"` string in `package.json` |
  | `tests.runner_not_in_ci` | no `test` string in any workflow |
  | `obs.empty_catch` | `catch\s*(\([^)]*\))?\s*\{\s*\}` |
  | `obs.no_logging_library` | none of `sentry`, `pino`, `winston` in `package.json` |

  **OOS row [A] (K24, from [X]):** on the OOS cohort only, B0 additionally flags quoted literals of at least eight characters
  assigned to names containing `secret|token|key|password` (case-insensitive), with no entropy or placeholder filter. This
  generic-keyword comparator is labelled OOS-only and never substituted for a main-rule B0 row.

- **B1 (#13 at `fe0a10016ac8fef46d8fa66e080b03f087fad84d`, secrets and RLS only).**
  - Original files are copied byte-for-byte (`supabase/functions/_shared/{auditors/secrets.ts, auditors/auth.ts, mask.ts,
    fetch-target.ts}`) and run under `tsx` with `allowImportingTsExtensions` (#13 uses `.ts` import suffixes and global `atob`);
    `deno-shim.d.ts` (new S44 code) declares `Deno` for type resolution.
  - **Adapter [A] (PLAN.md M3):** `adapter.ts` accepts only paths under `corpus/.out/`, reads each materialized case's files from disk
    (including non-template `.env*` text, synthetic corpus only), lists them in sorted `/`-normalized relative path order, and
    reproduces #13's own file selection exactly through `selection.ts` (a verbatim transcription of `fetch-repo.ts` lines 3–4, 29–46,
    71–83 and 99–115, each excerpt's sha256 recorded in `VENDORED.md`). Files #13 would not select are not given to B1. It calls
    `auditSecrets(files, "repo")` and `auditAuth(files, "repo")`, keeps only each finding's `rule_id` and `location`, drops
    `evidence`, `context` and `secretHash`, and serializes through `toSafe()`. `verify-b1.ts` checks the bytes against the pin.
  - Its mapping in `mapping.json`:

    | #13 rule | S44 rule |
    |---|---|
    | `openai_key`, `anthropic_key`, `aws_key`, `stripe_live_key`, `github_token`, `google_api_key`, `slack_token`, `private_key` | `provider_key` |
    | `service_role_jwt` | `service_role_jwt` |
    | `high_entropy_secret` | `secret_assignment` |
    | `committed_env_file` | `env_file_present` — **labelled "partial map" [A] (K25)**: #13 reads file text, S44 reads metadata; the mapping keeps #13's `.env.example` false positive visible |
    | `public_secret_var` | `public_prefixed_secret` |
    | `rls_missing` | `table_rls_not_enabled` |
    | `rls_using_true_update`, `rls_using_true_delete` | `literal_true_write_policy` |

    All other #13 ids are reported as an unmapped count. Tests and observability are N/A.
  - B1 is scored at path level.
- **B2 (gitleaks).**
  - Per-rule mapping, frozen from dev:
    - `provider_key` maps to gitleaks' provider rules (exact ids recorded from the pinned release's default config);
    - `secret_assignment` maps partially to `generic-api-key`, labelled "partial map";
    - `service_role_jwt` maps partially to gitleaks' JWT rule, if present in the pinned config;
    - `env_file_present` and `public_prefixed_secret`: N/A (different questions);
    - the OOS cohort: reported;
    - unmapped gitleaks findings: counted.
  - No pooled family comparison across incompatible rule scopes.
  - Capture contract (S25 `docs/BASELINES.md` pattern):
    - The builder pins a release and checks its `dir --help` against the official README (https://github.com/gitleaks/gitleaks#directory).
    - It records in `baselines/gitleaks/receipt.json`: version, binary sha256, default-config sha256, argv, cwd, platform, exit status,
      and the corpus and mapping hashes.
    - The run is in a clean temp copy of `corpus/.out/<split>/`, with no repo `.gitleaks.toml` and no env overrides, with redaction on.
    - **[A] (K18):** the invocation shape is `gitleaks dir <path> --report-format json --report-path <tmp>` plus either `--redact` or
      `--redact=100 --no-banner`; every flag is verified at capture against the pinned release.
    - The raw output stays outside git. A sanitized copy (values and raw lines removed) is committed, with both digests.
  - Status rules:
    - no receipt: "not yet measured";
    - hash, schema or mapping mismatch: "invalid measurement";
    - never a zero.
  - **Capture is deferred** (Dirty Mode): until a receipt exists the row reads "not yet measured".
- **Not run:**
  - Scorecard: no S44 rule maps. Primary source at commit `83b2069…`:
    - [localdir client](https://github.com/ossf/scorecard/blob/83b2069eee6e3c2fe7ae3b3eb745faa62224e618/clients/localdir/client.go);
    - [CI-Tests collector](https://github.com/ossf/scorecard/blob/83b2069eee6e3c2fe7ae3b3eb745faa62224e618/checks/raw/ci_tests.go);
    - [Security-Policy registration](https://github.com/ossf/scorecard/blob/83b2069eee6e3c2fe7ae3b3eb745faa62224e618/checks/security_policy.go)
      (cited from the peer's primary-source check).
  - trufflehog: AGPL, and its value is live verification, which S44 forbids.
  - Any model.

## 7.3 Metrics

- **For each rule × arm × cohort × match level:** P, TP, FN; D, FA, TN; abstentions; U (unplanned, scenes only); Dup; errors;
  overclaimed present; missed unknown.
- **Line-level and decoy rates:**
  - **recall** = TP/P;
  - **decoy false-alarm rate** = FA/(D − abstained decoys), with the abstained count printed beside it;
  - **precision** = TP/(TP+FA+U+Dup), with the prevalence P/(P+D) printed (K23: same quantity as [X]'s TP/(TP+FP)).
  - Duplicates enter precision only, never a binomial rate.
  - Headline rates are recall and decoy false-alarm rate.
- **Repo-level rules:** a 3×3 confusion of expected versus returned state, plus "overclaimed present".
- **Intervals [A] (K15; [C]'s "unstable when fewer than 1,000 resamples are defined" is struck):**
  - Wilson 95% on every binomial rate (vendored `wilson.ts`), with N/A at a zero denominator.
  - A scenario-group percentile bootstrap, **2,000 seeded resamples** per interval. Groups are counted **per rate's polarity**
    (recall: positive-case groups; decoy FA rate: decoy-case groups; paired contrast: groups in the shared cohort).
  - **Held-out single cohort:** the interval is shown only if groups ≥ 15 and valid draws ≥ 1,900, else "unavailable (reason)".
  - **Dev:** threshold groups ≥ 10 and valid draws ≥ 1,900; always labelled "dev — diagnostic".
  - **Scene and OOS cohorts:** computed with valid draws ≥ 1,900 and always labelled "exploratory (G groups)", never "unavailable"
    for group count alone.
  - **Paired group bootstrap** for every S44-versus-baseline difference on the same cohort; it uses the threshold of its cohort/split.
  - **Precision intervals:** Wilson plus a group bootstrap counted over the groups of all cases contributing a prediction or positive,
    same thresholds.
  - The group count and the valid/undefined draw counts are always printed.
  - No superiority wording from marginal intervals.
- **Also reported:** family rows as micro and rule-macro summaries, never a repository grade; scan time median and p95 per case after one
  warm-up, on a stated machine; cost $0.

## 7.4 Results table shape (generated from `results.jsonl`)

| split | cohort | arm@version | rule | map | groups | P | TP | FN | recall [W] [boot] | D | FA | abst | FA rate [W] [boot] | U | Dup | precision (prev) | errors | ms p50/p95 | hashes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

- A contrast table gives arm pair, cohort, Δrecall and ΔFA rate with the paired group interval and resample count.
- A header block gives:
  - the corpus lock, freeze commit and attempt id;
  - the CA and CR callsigns;
  - CR agreement per rule;
  - "synthetic corpus; rates do not transfer to real repositories".
- Before the run, every cell reads "not yet measured".
- **[A] Evaluator writers** (`results.md`, `LIMITATIONS.md`, `ADJUDICATION.md`, the README block) never print source text at a label
  span; they use case id, masked path and span coordinates, and they are guarded sinks for the leak guard.

## 7.5 Cost budget

- $0.
  - No model or provider call.
  - gitleaks is a free MIT binary; installing it at capture needs INT authorization.
- Live steps (all deferred under Dirty Mode; see `docs/DEFERRED-VALIDATION.md`):
  - `npm ci`, vitest, tsc, eslint;
  - `npm run eval` on dev (repeatable) and held-out (once);
  - the gitleaks captures;
  - `vite build`;
  - the demo.

## 7.6 Stop conditions

1. Lock, freeze or attempt record missing or mismatched: the evaluator refuses the held-out split.
2. Unresolved held-out labels, or a lock that cannot be reproduced: no held-out publication at all (not selective rows).
3. A leak-guard failure, or an unexpected network call (the test stub fires): stop until fixed.
4. A post-opening bug: attempt 1 stays published. A confirmatory re-run needs a new CA-authored held-out version.
5. Any proposed paid call: stop.
6. Package 4 exposes missing architecture: apply the section 3 cut order. Never call it finished.
7. Definitive gate NO-GO: skip the app.
8. Preregistered label: a rule whose held-out decoy false-alarm point estimate exceeds 0.20 is marked "noisy" in the README and in its
   `blind_spot` text. Nothing is removed after the attempt.
9. **[A] (K12):** G1 (full-corpus confirmation) not GO: no freeze and no held-out release.

## 7.7 Named failure list (preregistered; `LIMITATIONS.md` is generated from prediction–gold joins plus a reviewed reason for each)

| # | Failure | Rules |
|---|---|---|
| F1 | concatenated or encoded secrets | provider_key, secret_assignment |
| F2 | sequential or alphabet-like strings | secret_assignment |
| F3 | realistic-shape placeholders | provider_key |
| F4 | unlisted formats and neutral names (OOS cohort) | secrets |
| F5 | dynamic SQL, `DO` or rename (expected `unknown`) | RLS |
| F6 | drop and recreate | table_rls_not_enabled |
| F7 | non-literal always-true policies, restrictive neutralisation | literal_true_write_policy |
| F8 | tests asserting nothing | no_test_files |
| F9 | `test:unit` without `test` | no_test_script |
| F10 | reusable or external CI | runner_not_in_ci |
| F11 | internal loggers with other names | no_logging_library |
| F12 | comment-only "intentional" catches | empty_catch |
| F13 | `.env` with blank values; in folder but not committed | env_file_present |
| F14 | template dependence (group-level effects) | all |

B1's verified defects are named when observed: the `sk-` substring, duplicates, wrong-table RLS, quoted names, `.env.example`,
`VITE_SUPABASE_ANON_KEY`, `for all` missed, and `to service_role` flagged.
