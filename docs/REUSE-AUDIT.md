# Reuse audit: early Bolt #13 (vibe-code-auditor)

Source: `Bolt.New\vibe-code-auditor\vibe-code-auditor`, commit `fe0a10016ac8fef46d8fa66e080b03f087fad84d` (`fe0a100`), read-only.
**No LICENSE file exists at `fe0a100`** (checked 2026-10-27 against `git ls-files`); reuse rests on Roy's explicit authorization for
this app, recorded in `baselines/b1-vca13/VENDORED.md` (M3). Third-party notices in copied files are preserved.

Inventory: `git -C <#13> ls-files` at `fe0a100` lists **49 tracked files**; every one is listed below. No `.env` file is tracked,
and none was read. Verdicts follow [C] §8 as amended by PLAN.md (K8: `maskKey` is not ported; K16/K30: S26 bootstrap adapted).

Two independent uses are recorded per file:
- **Product (S44):** what S44's own code takes — *keep* (ported with tests), *data* (values only, logic rewritten), *idea* (design
  read, code rewritten), or *drop* (nothing taken).
- **B1 arm:** whether the file is part of the frozen "before" comparator (M3) — *byte copy* under `baselines/b1-vca13/` with the
  same relative layout, *transcribed excerpt* (verbatim lines in `baselines/b1-vca13/selection.ts`), or `—`.

Static import-graph check (authored in M1/M3, run in L1): no S44 module outside `baselines/b1-vca13/` imports any #13 file.

## Files used by S44 or by B1, or closely related (10)

| # | Path at `fe0a100` | Product (S44) | B1 arm | Reason / how confirmed first ([C] §8) |
|---|---|---|---|---|
| 1 | `supabase/functions/_shared/auditors/secrets.ts` | **data** + **keep** `decodeJwtRole` | byte copy | `RULES` table (lines 22–31) seeds `provider_key` formats; logic rewritten with left boundaries, longest-prefix classification, no `/g` with `.test`. `decodeJwtRole` (line 39) kept for `service_role_jwt`, re-tested (service_role, anon, authenticated, missing role, malformed base64url, non-JSON, padding). The stateful `RULES.some((r) => r.re.test(value))` on `/g` regexes (line 103) is characterization only (B1 duplicates test, inputs built from fragments). The `/\.env/` env check (line 116) is replaced by metadata-only `env_file_present`. Imports: `../fetch-target.ts` (type), `../mask.ts` (runtime). |
| 2 | `supabase/functions/_shared/auditors/auth.ts` | **idea** (rewrite) | byte copy | The line-17 `enable row level security[\s\S]{0,400}?…` regex is replaced by the statement tokenizer and RLS state tracker; regression inputs (a)–(i) of [C] §8. Anon-key and Firebase rules dropped. Imports are type-only (`../fetch-target.ts`, `./secrets.ts`). |
| 3 | `supabase/functions/_shared/mask.ts` | **drop** (K8) | byte copy | `maskKey` (first 4 / last 4) is **not ported** (struck by K8; S44 shows the format prefix + `…[redacted N chars]`). `SENSITIVE_TOKEN` (bare `sk-`) and the 32-bit FNV `hashText` are dropped. Copied for B1 only because `secrets.ts` imports it at runtime. |
| 4 | `supabase/functions/_shared/fetch-target.ts` | **drop** | byte copy | URL fetch/SSRF/DNS code must never enter S44. Copied for B1 only: `FetchedFile`/`FetchResult` types and the `MAX_TOTAL_TEXT_CHARS` constant used by `selection.ts`; top level has no side effects; its `Deno.resolveDns`/`Deno.errors` references resolve through the new `deno-shim.d.ts`. |
| 5 | `supabase/functions/_shared/fetch-repo.ts` | **idea** (rewrite) | transcribed excerpt | The kind map (lines 29–37) is an idea only: S44's own classifier treats `.env.example`/`.env.sample`/`.env.template` as templates (#13's `/\.env/` also catches them and `.envrc`). B1's `selection.ts` transcribes lines 3–4, 29–46, 71–83 and 99–115 verbatim (sha256 per excerpt in `VENDORED.md`); network calls replaced by disk reads. |
| 6 | `supabase/functions/_shared/policy.ts` | **data** | — | `FALLBACK_SEVERITY` (lines 81–132) seeds `severity_hint`; a test checks all 12 S44 rule ids have a severity. No logic or policy code taken. |
| 7 | `src/components/ScoreCard.tsx` | **keep** `SeverityChip` only (adapted, styling) | — | `src/viewer/SeverityChip.tsx` (M4). `GradeRing`, `Gauge` and `ProbabilityBar` dropped: no score, grade or probability in S44. jsdom render test; no numeric score in the UI. |
| 8 | `src/components/FindingsTable.tsx` | **idea** (rewrite) | — | Layout/filter idea for `src/viewer/FindingsTable.tsx`; the original calls `ignoreFinding` and shows model probabilities and fixer routes, none of which S44 has. |
| 9 | `src/lib/scanRunner.ts` | **idea** (rewrite) | — | `findingsToMarkdown` (line 520 onward, about 520–551) is a template idea for `src/core/report/md.ts`; golden `report.md` test: no locale dates, numbered steps, pipes/backticks escaped, no import of `scanRunner` or Supabase. |
| 10 | `src/lib/policy.ts` | **drop** | — | Client-side duplicate of the severity table (its own `FALLBACK_SEVERITY` at line 153 carries exploitability/fix-route fields); the server copy (#6) is the seed. |

## Dropped files (39)

Nothing from these files enters S44 or B1. Grouped by reason; each file is listed.

| # | Path at `fe0a100` | Verdict | Reason |
|---|---|---|---|
| 11 | `.bolt/config.json` | drop | #13's Bolt project config; S44 writes its own `BOLT-HANDOFF.md` |
| 12 | `.bolt/prompt` | drop | #13's Bolt prompt |
| 13 | `.gitignore` | drop | S44 has its own ([C] §4) |
| 14 | `README.md` | drop | #13 documentation |
| 15 | `eslint.config.js` | drop | S44 has its own config with core import bans |
| 16 | `index.html` | drop | S44 viewer has its own entry |
| 17 | `package-lock.json` | drop | no #13 dependency is reused |
| 18 | `package.json` | drop | no #13 dependency or script is reused |
| 19 | `postcss.config.js` | drop | no Tailwind/PostCSS in S44 |
| 20 | `tailwind.config.js` | drop | no Tailwind in S44 |
| 21 | `tsconfig.app.json` | drop | S44 has its own tsconfigs |
| 22 | `tsconfig.json` | drop | S44 has its own tsconfigs |
| 23 | `tsconfig.node.json` | drop | S44 has its own tsconfigs |
| 24 | `vite.config.ts` | drop | S44 has its own |
| 25 | `src/App.tsx` | drop | #13 app shell (URL/repo scan flow) |
| 26 | `src/main.tsx` | drop | #13 entry |
| 27 | `src/index.css` | drop | #13 styling |
| 28 | `src/vite-env.d.ts` | drop | #13 env typing |
| 29 | `src/pages/Home.tsx` | drop | URL/repo submission page; S44 input is a local folder via the CLI only |
| 30 | `src/pages/Report.tsx` | drop | #13 report page with grades/probabilities |
| 31 | `src/lib/fixtures.ts` | drop | #13 demo fixtures; S44's demo scaffold is builder-authored from fragments, and the corpus is CA's |
| 32 | `src/lib/supabaseClient.ts` | drop | no database, no supabase-js |
| 33 | `supabase/config.toml` | drop | no Supabase project |
| 34 | `supabase/functions/_shared/auditors/a11y.ts` | drop | web auditor; out of S44 scope |
| 35 | `supabase/functions/_shared/auditors/headers.ts` | drop | web auditor; out of S44 scope |
| 36 | `supabase/functions/_shared/auditors/performance.ts` | drop | web auditor; out of S44 scope |
| 37 | `supabase/functions/_shared/auditors/seo.ts` | drop | web auditor; out of S44 scope |
| 38 | `supabase/functions/_shared/auditors/index.ts` | drop | aggregates all six auditors; the B1 adapter calls `auditSecrets` and `auditAuth` directly |
| 39 | `supabase/functions/_shared/request.ts` | drop | edge-function request handling; no backend |
| 40 | `supabase/functions/_shared/usage.ts` | drop | usage counters; no backend |
| 41 | `supabase/functions/audit/index.ts` | drop | edge function; no backend |
| 42 | `supabase/functions/fetch-target/index.ts` | drop | URL fetch edge function; no network |
| 43 | `supabase/functions/jev-triage/index.ts` | drop | model triage; S44 uses no model |
| 44 | `supabase/functions/update-finding/index.ts` | drop | ignore/update flow; S44 has no ignore log |
| 45 | `supabase/functions/write-fix/index.ts` | drop | auto-fix; non-goal |
| 46 | `supabase/migrations/20261010035830_create_scans_findings.sql` | drop | no database |
| 47 | `supabase/migrations/20261010183445_add_usage_counters_and_tighten_grants.sql` | drop | no database |
| 48 | `supabase/migrations/20261010183513_revoke_usage_counters_grants.sql` | drop | no database |
| 49 | `supabase/migrations/20261012090000_add_increment_usage_by.sql` | drop | no database |

Totals: 49 files = 10 in the first table + 39 dropped. Of the first ten: product takes data from #1 and #6, keeps code from #1
(`decodeJwtRole`) and #7 (`SeverityChip`), reads #2, #5, #8 and #9 as ideas only, and takes nothing from #3, #4 and #10 (#3 and #4
are B1-only copies; #10 is listed beside the severity seed it duplicates). B1 uses 4 byte copies (#1–#4) and 1 transcribed excerpt
set (#5).

## [C] §8.1 seven-package trigger — assessment

**M1 static provisional assessment (2026-10-27).** Both rewritten paths are isolated pure-core implementations. Condition 1 does not fire: no backend/network/policy imports are needed. Condition 2 fires provisionally: both paths need new implementations around recorded provider data and JWT semantics; old maskKey was deliberately struck by K8. The original P1a/P1b split maps to disjoint M1 packages (shared safety/secrets boundary and RLS tracker), without changing frozen M0–M4 milestones (K31). A seventh-package condition is undetermined because vendored S26 tests have never run. No failure is inferred. More than 250 changed lines is an estimate warning only. Confirm after ROY-D3 with L1-16; runtime remains unverified.
