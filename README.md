# Repo posture doctor

Static evidence for a local repository folder, with a separate report viewer. Absence of a finding is not proof of safety.

**Source construction only — runtime unverified.** Dependencies have not been installed. No scanner, demo, tests, baseline,
benchmark, typecheck, lint, CLI build or viewer build has run. The independent corpus and its author/reviewer appointments are
pending. Error rates and improvements are **not yet measured**.

The offline scanner implements **12 literal rules** across secrets, Supabase migration RLS statements, test setup and
observability. It reports a state and a separate concern value, evidence pointers, scope coverage and blind spots. Findings
are observations to investigate. There is no repository score or safety certification.

The static viewer imports a local report as text-only data, supports filtering and shows skipped paths, declared exclusions
and what was not checked. Its bundled example is illustrative, not a scan output. Import limit: **5 MiB**. It does not upload
files or scan your filesystem; run the CLI locally to create a report.

## Later setup and use

These are future activation commands after the owner closes construction-only mode and authorizes dependency installation.
Node **24.18.0** is the declared development version. Dependency versions and these commands remain unverified.

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build:cli
node dist-cli/cli/main.js scan /path/to/repository --out /path/to/new-report-directory
npm run build
```

First installation creates the missing lockfile; subsequent reproducible installs use `npm ci`. The CLI builds to `dist-cli/`;
the static viewer builds to `dist/`. Serve the viewer locally only after claiming the required development port under the
owner's environment policy. Import `report.json` using its file picker.

`--out` must be a new directory outside the scanned root with an existing unredirected parent. The CLI writes `report.json`
and `report.md`; without `--out` it prints a bounded preview. It never opens sockets or spawns subprocesses. Exit **0** means
complete scope, **2** means input refused, **3** means incomplete coverage from caps or skipped entries. Findings alone do not
change the exit status.

The walker assumes a quiescent folder. Limits: **2,000 files**, **1 MiB per readable file**, **20 MiB total readable text**.
It rejects links and redirected entries, unsafe paths and case-folded duplicates. Git metadata, dependencies, agent/private
folders and key containers are excluded. Non-template environment files are examined by name and size only; their bodies are
never opened by the product scanner. Dist and build outputs remain in scope. Secret output is masked through one boundary;
credential validity is never checked with a provider.

## Demonstration and evaluation

`npm run demo` will materialize a synthetic builder-only demonstration in temporary directories and write masked reports.
Demo content is never evaluated as corpus. Do not use the bundled illustrative viewer report as evidence of execution.

The evaluator, grouped intervals, naive baselines, pinned before-arm adapter, receipt importer and one-use attempt guards are
source implementations. They remain unexecuted. Independent admission is required before materialization or evaluation.
The before arm is compared at path level; incompatible rule scopes are never pooled. Gitleaks capture is deferred and its
entrypoint refuses execution until the owner completes the activation procedure in `docs/BASELINES.md`.

<!-- BEGIN MEASURED RESULTS -->
Not yet measured. No admitted corpus or executed evaluation exists.
<!-- END MEASURED RESULTS -->

Run `npx tsx scripts/check-readme-numbers.ts` during the authorized validation phase to check numeric claims. An eventual
`--write` refresh derives the measurement block from the latest run in `results/results.jsonl`; construction has no such file.

## Boundaries and next work

Not checked: injection surfaces, health endpoints, public Supabase anon keys, git history, dependency CVEs, GitHub Actions
security, secret validity, effective RLS permissions and unlisted provider formats. Workflow parsing is deliberately
conservative: unsupported structures return unknown. Root-package assumptions can misrepresent a monorepo.

See `docs/RULES.md` for literal cards and interpretations, `docs/LIMITATIONS.md` for preregistered failure families,
`docs/EVAL-PROTOCOL.md` for cohorts and denominators, `docs/CORPUS-API.md` for independent data and hash contracts, and
`docs/DEFERRED-VALIDATION.md` for exact later checks. The data gate, lock, freeze and held-out attempt are pending; no builder
authors evaluation labels or treats a subagent as an independent corpus custodian.

No database, authentication service, storage service, remote API or model is required. This is a local-only repository with
no remote. Import, publication and deployment need the owner's separate authorization; see `BOLT-HANDOFF.md`.

New code is MIT-licensed, with pinned-source exclusions and notices described in `LICENSE`, `docs/REUSE-AUDIT.md` and the
vendoring notices. The copied before arm retains its original authorization basis and is not relicensed by this project.
