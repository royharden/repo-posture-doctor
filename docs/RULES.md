# Rule cards v1.0-draft

**Version: v1.0-draft.** These are the construction contract for the builder, the corpus author (CA) and the corpus reviewer (CR).
They are a draft until the G0 specification pilot (PLAN.md K13, ROY-D2): the pilot may revise a card as a new card version with
its reason recorded; the version frozen at the end of the pilot becomes `v1.x` and is bound by `results/FREEZE.json`. Nothing in
this repository has been run or measured.

**Source.** The card block below is copied **verbatim** from [C] = `planning/PLAN-FINAL.Claude.0784_Claude_Opus55_N20PlanS44.md`
(outer shell, read-only) §5.1, lines 292–426: the common clauses, the 12 cards and the shared RLS semantics. The card text is not
edited. Where PLAN.md amends a card, the amendment is listed after the block and **the amendment wins**.

**Card-text digest.** `sha256 = ecc68a4890f82abde6f106cd636366bc0110d25033c1a97820ca11643fe702e2`, computed over the exact bytes
between the two marker lines below (marker lines excluded): 135 lines, UTF-8, LF line endings, a trailing LF after the last line.
Re-check (read-only):

```sh
sed -n '/^<!-- BEGIN RULE CARDS v1.0-draft -->$/,/^<!-- END RULE CARDS v1.0-draft -->$/p' docs/RULES.md | sed '1d;$d' | sha256sum
sed -n '292,426p' "<outer>/planning/PLAN-FINAL.Claude.0784_Claude_Opus55_N20PlanS44.md" | sha256sum
```

<!-- BEGIN RULE CARDS v1.0-draft -->
**Common to every card:**
- A file needed by a rule that was skipped (cap, binary, unreadable, changed during the scan) makes that rule `unknown` for the affected
  scope, with `reason`.
- Line-level rules report only on files actually read.

**Secrets (line level unless noted).**

1. `secrets.provider_key`
   - Positive: a token of a listed format, with a left boundary (no `[A-Za-z0-9_-]` immediately before it) and a non-placeholder body.
   - Formats:
     - OpenAI `sk-`, `sk-proj-` (excluding `sk-ant-`);
     - Anthropic `sk-ant-`;
     - Stripe `sk_live_`, `rk_live_`, and `sk_test_` (`sk_test_` is severity `low`);
     - AWS `AKIA` + 16;
     - GitHub `ghp_`, `gho_`, `ghs_`, `ghu_`, `ghr_`, `github_pat_`;
     - Slack `xox[abprs]-`;
     - Google `AIza` + 35;
     - a PEM `BEGIN … PRIVATE KEY` marker in a readable file (a marker only; key material is not validated).
   - Fixture paths give severity `low`.
   - Decoys:
     - hyphenated identifiers (`task-management-dashboard-widget`);
     - placeholder bodies (`x`/`X` runs, `your_`, `<...>`, `changeme`, `example`, a single repeated character);
     - Stripe `pk_live_`;
     - wrong lengths.
   - Unknown: never (it is line level).
   - Blind spot: concatenated or encoded keys; unlisted formats.
2. `secrets.service_role_jwt`
   - Positive: a JWT-shaped value whose base64url payload decodes (bounded, no signature check) to JSON with `role: "service_role"`.
   - Decoys: `role: "anon"` and `"authenticated"`; missing role; malformed payloads.
   - Blind spot: new `sb_secret_` keys (Not checked).
3. `secrets.secret_assignment`
   - Positive: a string literal of at least 20 characters, assigned to (or an object key matching) a name that matches, case-insensitively
     on word boundaries, `secret|token|api[_-]?key|private[_-]?key|password|passwd`.
   - It must also have Shannon entropy of at least T bits per character, where T is chosen on dev and frozen.
   - Not if it is a placeholder, contains whitespace, or is a sequential run (at least 8 consecutive code-point steps of +1).
   - Decoys: UUIDs and IDs assigned to `*_id`, URLs, i18n strings, the alphabet string, `${VAR}` interpolation.
   - Blind spot: low-entropy real passwords; secrets in neutrally named variables (measured by the OOS cohort).
4. `secrets.env_file_present` (repo level, metadata only)
   - Positive: a file named `.env` or `.env.*`, except `.env.example`, `.env.sample` and `.env.template`, that is non-empty (size > 0).
   - Its body is never opened.
   - Decoys: template files; zero-byte `.env`; `.envrc`.
   - Unknown: the deny list hid the directory, or the file count cap was hit.
   - Blind spot: a `.env` holding only blank values is still reported (named limitation). Present in the folder does not mean committed.
5. `secrets.public_prefixed_secret`
   - Positive: a variable name with prefix `VITE_`, `NEXT_PUBLIC_`, `REACT_APP_` or `PUBLIC_` whose name contains `SECRET`,
     `SERVICE_ROLE`, `PRIVATE` or `PASSWORD`.
   - Where it is found:
     - referenced in source (`import.meta.env.X`, `process.env.X`);
     - defined in a readable config;
     - defined as a key in an env template file.
     Names only; non-template env bodies are not read.
   - Decoys: `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`.
   - Blind spot: secrets exposed under neutral names; names defined only in non-template `.env` bodies.

**Supabase RLS (line level: the first line of the `create table` or `create policy` statement).**

Shared semantics:
- Migrations are `supabase/migrations/*.sql` in lexical filename order.
- The tokenizer strips `--` and `/* */` comments and handles quoted strings and `$$` bodies.
- Unquoted identifiers fold to lower case; quoted ones keep their case. `public` is the default schema.
- Statements whose effect on a tracked table cannot be determined make that table `unknown` with a reason:
  - `DO` blocks and `EXECUTE`;
  - `ALTER TABLE … RENAME`;
  - `SET SCHEMA`;
  - parse failures.
  An unsupported statement never makes a table "absent".

6. `rls.table_rls_not_enabled`
   - Positive: a table in `public`, still existing after all migrations, whose final RLS state is not enabled.
     - Final state: the last `ENABLE` or `DISABLE ROW LEVEL SECURITY` (`ALTER TABLE [ONLY] [IF EXISTS] …`) applied after its latest
       `CREATE TABLE`.
     - `DROP TABLE` removes it. A recreated table starts disabled.
   - Decoys:
     - enabled in a later file;
     - quoted, schema-qualified or mixed-case names;
     - a neighbouring table with RLS in the same file (#13's wrong-table case);
     - `log`/`blog` name pairs;
     - commented-out statements;
     - non-`public` schemas;
     - dropped tables.
   - Blind spot: dashboard or out-of-band changes; grants; whether RLS policies are adequate.
7. `rls.literal_true_write_policy`
   - Positive: `CREATE POLICY … FOR INSERT|UPDATE|DELETE|ALL` on a tracked table whose `USING` or `WITH CHECK` expression is the literal
     `true` (optionally parenthesised).
   - Its `TO` list is absent or includes `public`, `anon` or `authenticated`.
   - Decoys: `FOR SELECT USING (true)`; `TO service_role`; `auth.uid() = user_id`; `AS RESTRICTIVE` policies.
   - Blind spot: always-true expressions other than `true`; restrictive policies that neutralise it; grants. The rule says "literal `true`
     clause present", not "anyone can write".

**Tests (repo level, three-state; the scope is the scanned root as one package).**

8. `tests.no_test_files`
   - `absent_in_scope` when the full path inventory was completed (no file-count cap) and no path matches:
     - `**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}`;
     - `**/__tests__/**/*.{ts,tsx,js,jsx}`;
     - `{e2e,tests,test,cypress,playwright}/**/*.{ts,tsx,js,jsx}`.
   - `unknown` when the inventory was capped.
   - Decoys: tests only in `e2e/`, `__tests__/` or `.spec.tsx`.
   - Blind spot: tests that assert nothing; in-source tests.
9. `tests.no_test_script`
   - `absent_in_scope` when the root `package.json` was parsed and `scripts.test` is missing, empty, or npm's placeholder
     `echo "Error: no test specified" && exit 1`.
   - `unknown` when there is no root `package.json`, or it is invalid or unreadable.
   - Decoys: `test` delegating to `vitest`, `jest`, `node --test` or `npm-run-all`.
   - Named limitation: `test:unit` without `test` is reported as absent.
   - Blind spot: monorepo packages.
10. `tests.runner_not_in_ci`
    - `absent_in_scope` when all of these hold:
      - a non-placeholder `scripts.test` exists;
      - every `.github/workflows/*.{yml,yaml}` file was read and parsed;
      - at least one exists;
      - no `run:` step contains `npm test`, `npm run test`, `pnpm test`, `yarn test`, `npx vitest`, `npx jest`, or `npm run <s>` where
        `<s>` itself invokes `test`.
    - `unknown` when:
      - there is no workflows folder;
      - any workflow is unreadable or invalid;
      - a job uses a reusable workflow (`uses:` at job level).
    - Decoys: a test step inside a matrix (absent → present); a reusable-workflow call (expected `unknown`).
    - Blind spot: CI outside GitHub Actions.

**Observability.**

11. `obs.empty_catch` (line level)
    - Positive: a `catch` clause in a non-test TS/JS file whose block contains no statements (comments allowed), found with TypeScript
      syntax parsing.
    - Decoys: a catch that rethrows, logs, returns or assigns; `catch` inside a string or comment.
    - Blind spot: catches that log at debug and continue; `.catch(() => {})` promise handlers.
12. `obs.no_logging_library` (repo level)
    - `absent_in_scope` when every `package.json` and every TS/JS source file was read, and:
      - no dependency or devDependency is in the fixed list (`@sentry/*`, `pino`, `winston`, `bunyan`, `loglevel`, `@datadog/*`,
        `@opentelemetry/*`, `rollbar`, `@bugsnag/*`, `@logtail/*`, `consola`);
      - no local module whose file name is `log|logger|logging|telemetry|monitoring` (`.ts` or `.js`) is imported by at least 2 files.
    - `unknown` when any source or manifest was skipped or capped.
    - Decoys: an internal `src/lib/log.ts` imported widely; a single Sentry init file.
    - Blind spot: platform logging; `console.error` used deliberately. The rule reports a missing library, not missing monitoring.
<!-- END RULE CARDS v1.0-draft -->

## Amendments from PLAN.md r6 (these win over the card text above)

- **Masking (K8).** [C] §3 item 6 ("first 4 and last 4", "masked middle") and the [C] §8 `maskKey` row are **struck**. #13's
  `maskKey` is not ported. Output masking follows "Masking and the output boundary" below.
- **Paths (K9).** Every path passes `toSafe()`; control characters become `\u{..}` escapes; a path whose name holds a candidate
  secret is shown masked. No raw path mapping is persisted.
- **Finding id (amends [C] §5.2 and [C] change 7).** `id = sha256(rule_id + "|" + subject)` as lowercase hex, where `subject` is
  defined in the result table below and is always built from the **`toSafe()`-masked, `/`-normalized relative path**, never the
  raw path. If two results in one report produce the same id, the later ones in sort order get `|#2`, `|#3` appended to the
  hashed string. Ids are per-report locators, not stable across edits. Computed by the pure-TS `src/core/sha256.ts`. No hash of a
  secret value exists anywhere.
- **`secrets.secret_assignment` name match, assignment syntaxes, entropy T and UUID exclusion:** see the interpretation notes.
- **`secrets.provider_key` PEM boundary:** see the interpretation notes (deviates from the card's generic left boundary).

## Results, subjects and states (PLAN.md §3a)

Four states: `flagged`, `present`, `absent_in_scope`, `unknown`. `concern` is `null` if and only if `state === 'unknown'`.
Every rule contributes at least one `RuleResult` per scan.

| Rule kind | Results emitted | `subject` |
|---|---|---|
| Line-level (`secrets.provider_key`, `secrets.service_role_jwt`, `secrets.secret_assignment`, `secrets.public_prefixed_secret`, `obs.empty_catch`) | one `flagged` (concern true) result **per finding**; plus **at most one** summary result for the rule: `absent_in_scope` (concern false) if every in-kind file was read and nothing was flagged; `unknown` (reason, coverage) if any in-kind file was skipped (emitted whether or not findings exist); no summary when findings exist and every file was read | finding: `<maskedPath>:<startLine>:<startCol>-<endLine>:<endCol>`; summary: `root` |
| `secrets.env_file_present` | one `flagged` result per qualifying file; summary as above (`unknown` only if the file cap was hit or a path in its scope was skipped; denied folders never cause `unknown`) | finding: `<maskedPath>`; summary: `root` |
| `rls.table_rls_not_enabled` | one result per tracked `public` table that exists after all migrations: `flagged` (final state not enabled), `present` (enabled; concern false) or `unknown` (reason); if there are no migrations or no tracked tables, one summary `absent_in_scope` concern false. **If any migration file was skipped:** every tracked table's result is `unknown` (reason `migration_skipped`) and one `root` summary `unknown` is also emitted, since a skipped file can create, enable or drop any table | `table:<schema>.<name>` (folded per the card) |
| `rls.literal_true_write_policy` | one `flagged` result per qualifying policy; summary as for line-level | `policy:<schema>.<table>.<policyName>` (policy name folded like identifiers); summary `root` |
| Repo-level (`tests.no_test_files`, `tests.no_test_script`, `tests.runner_not_in_ci`, `obs.no_logging_library`) | exactly one result: `absent_in_scope` **with concern true** (the thing looked for is absent), `present` (concern false), or `unknown` (reason) | `root` |

Evidence: line-level and RLS results carry `file:line` pointers (first line of the statement for RLS); repo-level and summary
results carry `coverage` (`required` globs/kinds, `examined`, `skipped` counts) and no pointer. An expected positive is
`flagged`, or `absent_in_scope` with concern true.

## Scan scope (`Report.scope`, the single definition of `ScanScope`)

```ts
interface ScanScope {
  root_label: string;                 // basename of the root folder only, through toSafe(); never an absolute path
  files_seen: number;                 // entries inventoried, excluding denied entries
  files_read: number;                 // files whose text was read
  metadata_only: number;              // files examined by name/size only (non-template .env*)
  skipped: { reason: string; count: number }[];          // entry-level skips, counted by fixed reason code
  skipped_paths: { path: string; reason: string }[];     // masked, '/'-normalized relative paths; capped at 2,000 entries
  denied: { pattern: string; count: number }[];          // deny-list hits: a declared scope boundary, not a skip
  inventory_complete: boolean;        // false if the 2,000-file cap stopped the path inventory
  content_complete: boolean;          // false if any in-scope file was not read (skip, cap, unreadable, binary)
  limits: { max_files: number; max_file_bytes: number; max_total_bytes: number };   // 2,000 / 1 MiB / 20 MiB
}
```

- `skipped_paths` is the sole path-level record of skips (`coverage.skipped` holds counts only). Its paths are masked exactly like
  result paths. When more than 2,000 entries were skipped, only the first 2,000 in walk order are listed; `skipped` still counts all.
- Walk order: ascending order of the `/`-normalized relative path (JavaScript string comparison, UTF-16 code units).
- No `score`, `grade` or `badge` field exists anywhere in the report.

## Input refusal, skips and the deny list (PLAN.md §3)

- **Exit codes:** 0 scan complete (findings or not); 2 input refused (nothing scanned); 3 coverage incomplete (some rule returned
  `unknown` for a cap or skip reason).
- **Refused (exit 2):** root missing, not a directory, itself a symlink/junction, or `--out` invalid (`--out` must be outside the
  root, must not exist, must not be a symlink).
- **Skipped and counted (entry level):** symlink, junction or name-surrogate reparse point (OneDrive cloud placeholders are reparse
  points but not name-surrogates and are read normally), traversal, case-folded duplicate path, path longer than 1,024 characters,
  binary (NUL in the first 8 KB), over the per-file or total cap, unreadable. Any rule whose required scope lost an entry returns
  `unknown`, which gives exit 3.
- **Denied by construction (not skipped):** `.git`, `node_modules`, `.thinking`, `.chatexports`, `.creds`; `*.pem`, `*.key`,
  `*.p12`; non-template `.env*` bodies (metadata only). Recorded in `scope.denied`. A denial never by itself makes a rule `unknown`
  and never causes exit 3. Exit 3 comes only from caps and entry-level skip reasons.

## v1.0-draft interpretation notes (shared with CA/CR; the G0 pilot may revise them)

- **Denied folders.** Files inside **any** denied folder (`.git`, `node_modules`, `.thinking`, `.chatexports`, `.creds`) are out of
  scope for every rule; nothing in them can be a positive or a decoy. The walker never descends into a denied folder; denied entries
  do not count toward the 2,000-file cap. Deny patterns match **exact path segments**, case-insensitively (`Node_Modules` is denied on
  Windows); `.git` does not match `.github`, and `.github` is scanned. `secrets.env_file_present` still sees `.env*` *metadata*
  everywhere outside the denied folders (non-template `.env*` files are metadata-only, not denied); its `blind_spot` names `.env`
  files inside denied folders.
- **`secrets.secret_assignment` name match.** Split the name into tokens on `_`, `-`, `.` and lower→Upper camelCase boundaries,
  lower-case them; match if the token sequence contains `secret`, `token`, `password`, `passwd`, `apikey`, `privatekey`, or the
  adjacent pairs `api key` / `private key`. So `OPENAI_API_KEY`, `DB_PASSWORD`, `stripeSecret` match; `tokenizer`, `keyboard` do not.
- **Assignment syntaxes** (TS/JS, JSON, YAML, env template files only; not Markdown or SQL): `const|let|var NAME = <lit>`,
  `NAME = <lit>`, object/class property `NAME: <lit>` or `"NAME": <lit>`, JSON `"NAME": "<lit>"`, YAML `NAME: <scalar>`, env template
  `NAME=<value>`. `<lit>` is a single/double-quoted string or a backtick template **without** `${`; length ≥ 20 measured on the
  literal body.
- **Entropy T.** Provisional `3.5` bits/char in `config/rules.json`, marked `"provisional": true, "to_be_chosen_on": "dev"`; frozen
  only at FREEZE.
- **UUID exclusion (open for the G0 pilot).** UUIDs assigned to `*_id` names are decoys for `secret_assignment`, but a hyphenated UUID
  can exceed the provisional T = 3.5. v1.0-draft excludes values matching the canonical UUID shape
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (case-insensitive) from `secret_assignment`; the pilot confirms or
  revises it.
- **"Non-test file"** (`obs.empty_catch`): a path not matching any `tests.no_test_files` glob.
- **RLS policy subject:** `policy:<schema>.<table>.<policyName>`, the policy name folded like identifiers (unquoted → lower case,
  quoted keeps case); table subject `table:<schema>.<name>`, folded per the shared RLS semantics.
- **PEM boundary.** A PEM marker counts when preceded by start of line or any non-`-` character, including after an escaped `\n` in
  a single-line chain (this deviates from card 1's generic `[A-Za-z0-9_-]` left boundary; flagged for G0).
- **Error text.** `reason` fields and console errors use fixed reason codes (e.g. `invalid_json`, `unreadable`, `parse_failure`,
  `migration_skipped`), never raw parser/runtime messages (V8 `JSON.parse` errors quote input), and pass `toSafe()`.
- **Evaluator writers.** `LIMITATIONS.md`, `ADJUDICATION.md`, `results.md` and the README block never print source text at a label
  span; they use case id, masked path and span coordinates. The README block is a guarded sink.
- **Span per rule (S44 results and labels use the same convention):** `provider_key` = the token (for a PEM finding S44 reports
  the BEGIN marker; a PEM *label* span covers the BEGIN…END block, see `docs/CORPUS-API.md`, so the two overlap); `service_role_jwt`
  = the whole JWT; `secret_assignment` = the literal body (no quotes, no name); `public_prefixed_secret` = the variable name;
  `obs.empty_catch` = from `catch` to the closing `}`; RLS = the whole statement (pointer on its first line).
- **Span coordinates.** 1-based lines; 1-based columns counted in UTF-16 code units; `endLine:endCol` is the **last character** of
  the span (inclusive). A line ends at `\n`; a `\r` immediately before `\n` belongs to the terminator and is not counted. Two spans
  overlap when they are in the same file and the closed intervals `[startLine:startCol, endLine:endCol]` intersect.

## Masking and the output boundary (PLAN.md §3b)

Every string that leaves the core passes one serializer, `toSafe()`: messages, paths, excerpts, reasons, errors, `report.md`,
console output and sanitized baseline captures.

- **Provider candidates** show the matched **format prefix** + `…[redacted N chars]` (N = characters after the prefix). Longest
  listed prefix wins: `sk-ant-` > `sk-proj-` > `sk-`; `github_pat_` and `ghp_`/`gho_`/`ghs_`/`ghu_`/`ghr_` are distinct; `sk_live_`,
  `rk_live_`, `sk_test_`; `AKIA`; Slack shows its 5-character `xox?-` prefix; Google `AIza`.
- **PEM.** A PEM finding's excerpt and `message` are **exactly the marker text** `-----BEGIN <TYPE> PRIVATE KEY-----`, with no
  window and nothing after it, whether the key is multi-line or single-line with `\n` escapes (service-account JSON
  `"private_key"`, JS strings, env templates, bundles). In any **other** finding's excerpt, everything from a PEM BEGIN marker to
  its END marker (or to end of line if there is no END marker on that line) becomes `-----BEGIN <TYPE> PRIVATE KEY-----…[redacted]`.
  The marker regex has the left boundary above. `toSafe()` leaves a bare marker unchanged.
- **JWTs.** `service_role_jwt` shows `eyJ…[redacted N chars] (payload role=service_role)`. **Every** JWT-shaped token on an
  excerpted line is masked this way, including anon/authenticated tokens that are not findings.
- **`secret_assignment`** shows `<name> = [redacted N chars]`: no characters of the value.
- **One candidate finder.** `src/core/safe.ts` exports a single `findCandidates(text)` used by masking and by leak-guard set (b). It
  covers every provider format, every JWT shape, every PEM block and every `secret_assignment`-shaped literal body (name match +
  length, before placeholder/entropy/UUID filters); overlapping candidates merge into one masked span. The secrets rules filter its
  output, so every detection is masked by construction. Once a value is detected, every exact occurrence of it in every output string
  is masked too.
- **Excerpt order.** (1) take the full source line; (2) replace every span `findCandidates` returns on that line with its masked form,
  whole; (3) only then cut the window from 40 characters before to 40 characters after the (re-positioned) matched span, never cutting
  inside a masked token (extend to the token edge); (4) Markdown/control-character escape. Non-secrets rules (RLS, `obs.empty_catch`)
  use the same window, except PEM findings (marker only). Paths with a candidate inside are masked the same way.
- **Leak guard.** The guarded set G is the union of (a) every planted secret value in the guarded input — for corpus cases, only
  labels with `polarity: positive` for `secrets.provider_key`, `secrets.service_role_jwt` and `secrets.secret_assignment`, plus the
  OOS cohort's intended credentials; the guarded value is the bytes at the label span (for `secret_assignment` the literal body only,
  not the name); decoys, `public_prefixed_secret` names and `env_file_present` labels are not guarded; for builder test fixtures, the
  values the fixture declares as planted — and (b) every candidate S44 detects for those three rules (rule detections only, not the
  unfiltered `findCandidates` superset). For each value, *body* = value minus its recognised format prefix (whole value if none).
  **PEM:** the marker text is not part of G; body = all key material between the BEGIN and END markers, whether separated by real
  newlines or by `\n` escapes and whether on the marker's line or later lines (whitespace and `\n`, `\\n`, `\r\n` escapes removed
  before windowing); with no END marker the body ends where the contiguous base64 run ends. If |body| ≥ 6, **no 6-character window
  of body** may appear in any output string (report.json, report.md, console, error messages, B1/gitleaks sanitized captures,
  `results.jsonl`, `results.md`, `LIMITATIONS.md`, `ADJUDICATION.md`, the README block). A missed planted value that still appears in
  an output is a **reported leak-guard failure** ([C] §7.6 stop 3), never hidden or exempted.

## Not checked (listed in every report)

Injection surface; health endpoints; Supabase anon key (public by design); git history; dependency CVEs; GitHub Actions risks (S25);
secret validity; RLS effectiveness; new `sb_secret_` keys.

## Wording rule

Absence says "no test files found in N scanned paths (globs: …)", never "no tests". CLI help: "static evidence in the scanned scope;
absence of a finding is not proof of safety."
