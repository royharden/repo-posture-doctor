# Agent instructions: repo-posture-doctor (inner repo)

## What this repo is
`posture-doctor` is a local, offline TypeScript CLI that reports **static evidence in the scanned scope** for 12 literal rules
(secrets, Supabase RLS, tests, observability) as `report.json` + `report.md`, plus a static React viewer that imports a
`report.json`. It has no score, grade or badge, no model, no network, no database. Its error rates are to be measured on a
seeded synthetic corpus written by agents **other than the builder**. Absence of a finding is not proof of safety.

Plan of record: the outer shell's `PLAN.md` (r6; frozen copy `planning/PLAN-FINAL.md`). The rule cards are `docs/RULES.md`
(v1.0-draft until the G0 gate). Live status lives in the outer shell's `STATUS.md` / `HANDOFF.md`, not here.

## Current mode: Dirty Mode (construction only)
Roy enabled Dirty Mode for S44 only (2026-10-27 12:20 PM ET). Until Roy closes it (ROY-D3):
- static checks only: reading, grep, `git` read commands, sha256, JSON parse, and the syntax gate
  `node <outer>/agentops/tools/ts-syntax-check.mjs <files…>`;
- **no** installs, lockfile, `npx`, `tsx`, tests, `tsc`, eslint, vite, dev servers, browsers, Docker, gitleaks, network or paid calls;
- nothing here has been run; every live step is listed in `docs/DEFERRED-VALIDATION.md`.
Normal rules resume when Dirty Mode closes; runtime remains unverified until then.

## Independence (overrides any text implying otherwise)
- The builder lineage (S44-INT and its subagents) authors **no corpus** (dev or held-out), no labels, no pilot snippets and no
  expected answers. Unit-test fixtures and the `demo/` scaffold ("demo only — never evaluated") are allowed; `src/eval/` never
  imports `demo/`.
- `corpus/dev/` is written by the independent corpus author (CA); `corpus/heldout/` stays empty until INT releases it after the
  freeze. The held-out custody folder is outside this repo and is never read by the builder lineage.
- CA and CR read only the files their packets name (`docs/RULES.md`, `docs/CORPUS.md`, `docs/CORPUS-API.md`,
  `docs/EVAL-PROTOCOL.md`, `src/shared/vendored/rng.ts`).

## Secrets and fake-secret hygiene
- No real credential, key, token or `.env` file ever enters this repo. `.env.example` holds one comment. Never read any `.env*`
  body, `Bolt.New\.creds\`, or credential files.
- **No contiguous provider-format value in any committed file** (tests, demo, docs, configs). Build provider-format test values
  from fragment arrays joined at runtime, e.g. `['sk', '_li', 've_'].join('') + body`, with bodies from a seeded generator.
- **PEM markers too:** tests and fixtures build even a *bare* PEM marker from fragments (e.g.
  `['-----BEG', 'IN ', 'RSA PRIV', 'ATE KEY-----'].join('')`), never as one literal, and never follow one with literal base64.
- Every milestone review runs the literal sweep (PLAN.md §3b patterns) over the whole repo; allowed matches go in
  `config/secret-sweep-allow.json` by exact file + line + reason (expected: none).

## Code conventions
- Strict TypeScript, erasable syntax only (no `enum`, `namespace`, parameter properties); `import type` for types; relative imports
  with explicit `.ts` suffix. Tag each rule's code `// rule <rule_id>`.
- `src/core/**` is pure: it imports only relative modules and `typescript`; no `node:*`, `fetch`, `Date`, `Math.random`.
- The CLI never spawns subprocesses and never opens sockets. Every output string passes `toSafe()`.
- Byte-for-byte copies (`src/shared/vendored/{rng,wilson,entropy}.ts`, `baselines/b1-vca13/supabase/**`) are never edited.

## Layout rule
This is the inner repo. Agent-only material (plans, reviews, transcripts, custody, scratch) belongs in the outer shell, never here.
Do not commit; S44-INT commits locally. No remote, no push (ROY-D4).
