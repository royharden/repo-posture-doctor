# Corpus API (v1.0-draft)

The contract between the independent corpus author (CA), the corpus reviewer (CR) and the builder. The builder codes the loader,
validator and materializer (`src/eval/labels.ts`, `scripts/materialize.ts`) against this file and **never writes a generator, a case
or a label**. Sources: PLAN.md §3a–§3c and §4, [C] §6.2, §7.1 and §10. Where this file and the rule cards disagree,
`docs/RULES.md` (cards plus amendments) wins; report the disagreement in the pilot.

Status: draft for the G0 pilot. Field lists may be refined with CA at G0; any change is versioned here and reconciled in code (R1).

## 1. Generator

```ts
import { createRng } from '../../src/shared/vendored/rng.ts';   // the only S44 module a generator may import

export function generate(seed: number, split: 'dev' | 'heldout'): {
  cases: RepoSnapshot[];
  labels: Label[];
  manifest: Manifest;
};
```

- Deterministic: the same `(seed, split)` gives byte-identical `cases`, `labels` and `manifest`. Use the vendored seeded `Rng` with
  `fork(label)`; no `Math.random`, no clock, no network, no file system, no environment variables.
- Never import scanner code (`src/core`, `src/cli`, `src/eval`, `baselines/`, `scripts/`), never run any detector, never observe
  predictions. Truth comes from the authored mutation offsets and structure only.
- **A recipe is a scenario group:** a base scaffold (React/Vite app, Node/Express API, Supabase project, bare package) plus one
  parameterised mutation (where, what, how rendered). Renderings of a recipe (identifier names, indentation, file position,
  surrounding code) are the cases of that group. Recipes differ between splits: no shared scaffold-and-mutation pair; a
  normalized-recipe hash check enforces it (`Manifest.recipes[].recipe_hash`).
- **Secret bodies come only from the seeded `Rng`.** Provider prefixes are fragment arrays (for example `['sk', '_li', 've_']`),
  joined at generation time. PEM markers are fragment-built too. No string is copied from any external source (CA attests it in
  `docs/CORPUS.md`). No contiguous provider-format value may appear in any generator source file:
  `scripts/check-no-secret-literals.ts` sweeps CA material (G0 B4).
- $0: no model or provider call; never verify a generated value with any provider.

## 2. Cases

```ts
interface RepoSnapshot {
  case_id: string;                 // unique within the split; [a-z0-9-]{1,64}; carries no split id and no polarity word
  files: CorpusFile[];
}
interface CorpusFile {
  path: string;                    // relative, '/'-separated, no leading '/', no '.' or '..' segments
  content: string;                 // file bytes: UTF-8 text, or base64 when encoding is 'base64'
  encoding?: 'utf8' | 'base64';    // default 'utf8'; use 'base64' for binary-file cases (NUL in the first 8 KB)
}
```

Path rules (so every case materializes identically on Windows and POSIX):
- valid Windows file names: no `<>:"|?*`, no control characters, no trailing dot or space, no reserved device names
  (`CON`, `NUL`, `COM1`…);
- no two paths in a case that are equal after case folding;
- total path length ≤ 1,024 characters;
- **no case files inside denied folders** (`.git`, `node_modules`, `.thinking`, `.chatexports`, `.creds`, matched as exact path
  segments, case-insensitively): they are out of every rule's scope, so nothing there can be a positive or a decoy;
- symlinks, junctions and unreadable files cannot be expressed in v1; do not plan expected-`unknown` cases that need them.

Conditions that **can** be expressed: binary files (`encoding: 'base64'` with a NUL byte), files over 1 MiB, total readable text over
20 MiB, more than 2,000 inventoried files (cap hit), invalid JSON/YAML, reusable workflows, unsupported SQL statements.

## 3. Labels

Label shape = [C] §6.2 + `subject` (PLAN.md §3c):

```ts
interface Span { startLine: number; startCol: number; endLine: number; endCol: number }

interface Label {
  case_id: string;
  split: 'dev' | 'heldout';
  cohort: 'single' | 'scene' | 'oos';
  group_id: string;                // the recipe (scenario group)
  rule_id: string;                 // one of the 12 rule ids; OOS labels use 'secrets.*' (any secrets-family rule)
  polarity: 'positive' | 'decoy' | 'expected_unknown';
  level: 'line' | 'file' | 'table' | 'policy' | 'repo';
  path: string | null;             // case-relative, '/'-separated; null for repo-level labels
  span: Span | null;               // null for file, repo, and line/file expected_unknown labels
  subject: string | null;          // see below
  expected_state: 'flagged' | 'present' | 'absent_in_scope' | 'unknown' | null;
  expected_concern: boolean | null;
}
```

### `level` and `subject` per rule

| Rule | `level` | `subject` |
|---|---|---|
| `secrets.provider_key`, `secrets.service_role_jwt`, `secrets.secret_assignment`, `secrets.public_prefixed_secret`, `obs.empty_catch` | `line` | `null` (derived from `path` + `span`) |
| `secrets.env_file_present` | `file` | `null` (derived from `path`) |
| `rls.table_rls_not_enabled` | `table` | `table:<schema>.<name>` |
| `rls.literal_true_write_policy` | `policy` | `policy:<schema>.<table>.<policyName>` |
| `tests.no_test_files`, `tests.no_test_script`, `tests.runner_not_in_ci`, `obs.no_logging_library` | `repo` | `root` |

Folding as in the cards: unquoted identifiers fold to lower case, quoted ones keep their case, `public` is the default schema; the
policy name folds like an identifier. For `table`/`policy` labels, `path` is the migration file holding the statement (informational;
the join uses `subject`), or `null` for an expected-`unknown` table label.

### Expected state per polarity

| Polarity | line / file | table / policy | repo |
|---|---|---|---|
| `positive` | `flagged`, `true` | `flagged`, `true` | `absent_in_scope`, `true` |
| `decoy` | `null`, `false` (no concerning result may match it) | table enabled: `present`, `false`; dropped table, non-`public` schema or policy decoy: `null`, `false` | `present`, `false` |
| `expected_unknown` | `unknown`, `null` | `unknown`, `null` | `unknown`, `null` |

A provider-format key under a fixture path is a **positive** (S44 gives it severity `low`), not a decoy. Decoys are only things that
are provably not credentials or provably not the pattern (placeholders, wrong shapes, anon JWTs, identifiers, publishable keys,
enabled-later tables, …; see each card's decoy list).

### Span convention (PLAN.md §3b; S44 results use the same)

- `secrets.provider_key`: the token. **PEM positives:** from the first `-` of the BEGIN marker to the last `-` of the END marker
  (or, with no END marker, to the end of the contiguous base64 run). S44 reports the BEGIN marker itself, which overlaps the label.
- `secrets.service_role_jwt`: the whole JWT (header, payload and signature).
- `secrets.secret_assignment`: the **literal body only** — no quotes, no name.
- `secrets.public_prefixed_secret`: the variable name.
- `obs.empty_catch`: from `catch` to the closing `}`.
- RLS: the whole statement (S44's pointer is on its first line).
- Coordinates: 1-based lines; 1-based columns in UTF-16 code units; `endLine:endCol` is the **last character** of the span
  (inclusive). A line ends at `\n`; a `\r` immediately before `\n` belongs to the terminator. Spans overlap when they are in the same
  file and the closed intervals `[startLine:startCol, endLine:endCol]` intersect.

The leak guard uses the bytes at the label span of `positive` labels for `provider_key`, `service_role_jwt` and
`secret_assignment`, plus OOS intended credentials (`docs/RULES.md`, "Masking and the output boundary"). A span that is wider than
the secret (e.g. including quotes or the name for `secret_assignment`) breaks that guard: keep spans exact.

### Expected-`unknown` labelling

- **Minimum (held-out): ≥ 10 expected-`unknown` labels per rule** for each of `secrets.env_file_present`, `tests.no_test_files`,
  `tests.no_test_script`, `tests.runner_not_in_ci`, `obs.no_logging_library`, and **≥ 10 RLS table labels**
  (`rls.table_rls_not_enabled`, subject `table:<schema>.<name>`). These are in addition to the positive and decoy minimums.
- **Repo-level and RLS labels** use their exact `subject`. An RLS table label for a table whose only result is folded into an
  `unknown` `root` summary (e.g. a migration file was skipped) is still written with its `table:` subject.
- **Line-level and file labels** use `subject: null`, a `path` and `span: null`; they mean "this file's rule outcome cannot be
  decided" (the file was skipped, or never inventoried because of the cap).
- **`env_file_present` cap-hit labels are written by path** (`level: 'file'`, `subject: null`, the `.env*` path that the 2,000-file
  cap leaves uninventoried or skipped).
- Each expected-`unknown` label carries its reason in the manifest (`Manifest.cases[].unknown_reasons`), so CR can check it against
  the card's `unknown` conditions.

### Scenes and single-rule cases

- `single` cases are scored only on their labelled rule (all 12 rules run).
- `scene` cases are exhaustively labelled across all 12 rules: every concerning S44 result in a scene either matches a label or is an
  `unplanned` false positive. Repo-level rules in a scene always get a `root` label.
- `oos` cases hold credentials of formats S44 does not target, plus benign look-alikes, and are reported separately as exploratory.

## 4. How labels are joined to results (PLAN.md §3c; for CA/CR understanding)

- Label paths go through the same `/`-normalisation and `toSafe()` masking as scanner paths before comparison.
- Join keys: line-level → (case, rule, masked path, overlapping span); `env_file_present` → (case, rule, masked path); RLS and
  repo-level → (case, rule, exact `subject`). The B1 path-level cohort joins on (case, mapped rule, masked path) only.
- Only results with `concern === true` are predictions. `present`, `absent_in_scope` with concern false and all `root` summaries are
  never predictions and never unplanned false positives.
- Abstention: an `unknown` result with the label's exact subject (RLS, repo-level), or, for line/file labels, the label's masked path
  appearing in `scope.skipped_paths`.
- Expected-`unknown` scoring: see `docs/EVAL-PROTOCOL.md` §7.1.

## 5. Manifest

```ts
interface Manifest {
  schemaVersion: 1;
  split: 'dev' | 'heldout';
  seed: number;
  generatorSha: string;            // sha256 of CA's generator source tree (sorted relative paths + bytes)
  licence: 'MIT';
  rulesVersion: string;            // card version the corpus was written against, e.g. 'v1.0-draft' / 'v1.x'
  rulesDigest: string;             // the card-text sha256 printed in docs/RULES.md
  recipes: { groupId: string; ruleIds: string[]; cohort: 'single' | 'scene' | 'oos';
             scaffold: string; mutation: string; recipe_hash: string }[];   // recipe_hash = normalized-recipe sha256
  cases: { case_id: string; group_id: string; cohort: 'single' | 'scene' | 'oos'; rule_ids: string[];
           files_sha256: string;   // sha256 over sorted (path, bytes) pairs of the materialized case
           unknown_reasons?: { rule_id: string; path: string | null; reason: string }[] }[];
  counts: { rule_id: string; polarity: 'positive' | 'decoy' | 'expected_unknown'; cases: number; groups: number }[];
}
```

`recipes[].{groupId, ruleIds, licence (from the manifest), generatorSha}` with `schemaVersion` is the recipe metadata S44 exports for
S45 ([C] §10).

## 6. Materialization ([C] §6.2)

- `scripts/materialize.ts` writes each case to `corpus/.out/<split>/<case-id>/` (gitignored) and **refuses to write outside that
  folder**.
- `materialize --check` regenerates twice and compares hashes with the manifest (and, for held-out, with
  `corpus/heldout.lock.json`).
- Split ids and the words "positive" and "decoy" never appear in emitted files or paths (case ids included).
- Fake secrets exist only in materialized bytes under `corpus/.out/`, never in tracked files.

## 7. Scanner facts a corpus author relies on

- **Walk order:** S44 lists entries in ascending order of the `/`-normalized relative path (JavaScript string comparison, UTF-16
  code units). Which entries fall past the 2,000-file cap follows from this order; cap-hit labels depend on it.
- **Limits:** 2,000 files, 1 MiB per file, 20 MiB of readable text. Denied entries do not count toward the file cap.
- **Readable kinds:** TS/JS (`.ts .tsx .js .jsx .mjs .cjs .mts .cts`), JSON, SQL, YAML, Markdown, env template files
  (`.env.example`, `.env.sample`, `.env.template`). Non-template `.env*` files are metadata only (name and size). `*.pem`, `*.key`,
  `*.p12` are denied. `dist/` and `build/` are scanned.
- **Report scope** (`Report.scope`, `ScanScope`): `root_label`, `files_seen`, `files_read`, `metadata_only`, `skipped`
  `{reason,count}[]`, `skipped_paths` `{path,reason}[]` (masked, `/`-normalized, **capped at 2,000 entries** in walk order),
  `denied` `{pattern,count}[]`, `inventory_complete`, `content_complete`, `limits`. Full definition in `docs/RULES.md`.

## 8. Export to S45 ([C] §10)

S44 exports `generate(seed, split)` with the recipe metadata `{schemaVersion, groupId, ruleIds, licence, generatorSha}`. S44 consumes
nothing from S45. **Held-out custody material is never exported before the one held-out attempt**; only cleared dev recipes may be
exported earlier, and only on a separate grant.


## Construction adapter hash convention (pending G0 confirmation)

`scripts/corpus-io.ts` hashes sorted path/byte pairs using an 8-byte header per pair: unsigned big-endian 32-bit UTF-8 path
length, then unsigned big-endian 32-bit payload length, then the UTF-8 normalized relative path and raw bytes. Case hashes
use materialized bytes (base64 inputs are decoded). Generator hashing currently includes all permitted source-tree files.
`corpus_sha256` hashes JSON of ordered `{case_id, files_sha256}` records; `labels_sha256` hashes JSON of the validated labels.
CA must agree these exact canonicalizations at G0 before delivering any lock.

**Open packaging seam:** a pure generator cannot simply hardcode a digest of the source tree that contains that same digest.
The independent CA/CR must resolve non-self-referential generator attestation packaging during G0/R1; source-plus-detached
metadata is a candidate, not an approved contract change. The present loader validates the returned manifest against actual
source bytes and will refuse mismatches. No delivered corpus or successful materialization is claimed. Do not author a fake
attestation or weaken this check to pass a placeholder. Reconcile the adapter to the agreed version before real evaluation.
