# Deferred validation

Everything here is **not done**. S44 is built under Dirty Mode (Roy, 2026-10-27, S44 only): static checks only, no installs, runs,
network or spending. Runtime remains unverified until Roy closes Dirty Mode and authorizes live validation (ROY-D3, PLAN.md §6 L1),
or until the named gate. Each milestone appends what it defers. Commands run from the inner repo root unless stated.

## L1 — live validation (builder, Normal mode, after ROY-D3)

| # | What | Why deferred | Exact later command |
|---|---|---|---|
| L1-1 | Install dependencies and create the lockfile; confirm every declared version range in `package.json` resolves (versions were chosen without a registry lookup) and bump any that do not | Dirty Mode: no installs, no network | `npm install` (first time, writes `package-lock.json`), then `npm ci` |
| L1-2 | Typecheck everything, including `baselines/**` (#13 byte copies under `strict`) and the `Deno` shim | No `tsc` runs | `npm run typecheck` |
| L1-3 | Lint, including the `no-restricted-imports` `regex` pattern (needs an ESLint version that supports it) and the core/CLI/viewer bans | No eslint runs | `npm run lint` |
| L1-4 | Unit tests (all authored test sources), with the network spy setup `test/setup/no-network.ts` | No test runs | `npm test` |
| L1-5 | CLI build; confirm `rewriteRelativeImportExtensions` without `allowImportingTsExtensions` (TypeScript ≥ 5.7) and that `dist-cli/cli/main.js` exists for the `bin` | No `tsc` builds | `npm run build:cli` then `node dist-cli/cli/main.js --help` |
| L1-6 | Determinism: two scans of the same materialized dev case give identical `report.json` bytes | Needs a run and a corpus | `npm run materialize -- --split dev` then `node dist-cli/cli/main.js scan corpus/.out/dev/<case> --out <tmp1>` twice into fresh dirs and compare with `sha256sum` |
| L1-7 | Demo with network stubbed to throw, recording its time | No runs | `npm run demo` (under the vitest network stub per [C] P2) |
| L1-8 | Viewer build; viewer opens the demo report with requests stubbed. A dev server port must first be claimed with the agent-ports skill (`scripts/ports.py claim`) | No vite, no dev server, no browser | `npm run build`; for a dev server: claim a port, then `npx vite --port <claimed>` |
| L1-9 | B1 byte pin and smoke test (B1 reproduces [C] §8 inputs (a), (b), the `sk-` substring and `.env.example`) | No runs | `npm run verify-b1` |
| L1-10 | Corpus materialization reproducibility (needs CA's dev split) | No runs; corpus not delivered (ROY-D1) | `npm run materialize -- --split dev --check` (run twice by INT) |
| L1-11 | Dev evaluation of every arm | No runs; needs corpus | `npm run eval -- --split dev` |
| L1-12 | gitleaks: download a pinned release (needs INT authorization), verify `dir --help` against the official README, capture on dev into a clean temp copy with default config, write the receipt and sanitized capture | No downloads, no gitleaks runs | `npx tsx scripts/capture-gitleaks.ts --split dev` (after the binary is authorized and pinned) |
| L1-13 | Repository self-scan with `.gitleaks.toml`; confirm its `[allowlist]` syntax against the pinned release | No gitleaks runs | `gitleaks dir . --config .gitleaks.toml --redact` |
| L1-14 | Leak guard over the dev corpus plus adversarial-path fixtures and every writer | No runs | `npm test` (leak-guard suites) and `npm run eval -- --split dev` |
| L1-15 | Vendored S26 conformance: Wilson(8,10) = [0.4902, 0.9433]; (0,10) = [0, 0.2775]; (10,10) = [0.7225, 1]; Shannon("ab") = 1, ("aaaa") = 0, alphabet = 4.7004; seeded RNG first 10 outputs stable; `fork` streams independent | No test runs | `npm test -- vendored` |
| L1-16 | Confirm the [C] §8.1 seven-package trigger assessment (static, provisional in `docs/REUSE-AUDIT.md`) | Needs the P1 tests to run | `npm test` then update `docs/REUSE-AUDIT.md` §8.1 |
| L1-17 | Confirm `.gitattributes` keeps byte pins and the `docs/RULES.md` card digest on a fresh Windows checkout (`core.autocrlf=true`) | Needs a fresh clone/checkout | `git clone <repo> <tmp>` then the sha256 commands in `docs/RULES.md` and `src/shared/vendored/VENDORED.md` |
| L1-18 | Confirm `tsconfig.json` / `tsconfig.cli.json` tolerate the `"//"` comment key and that `types: ["node", "vite/client"]` resolve | No `tsc` runs | `npm run typecheck` and `npm run build:cli` |

## Gated steps (not builder milestones; PLAN.md §6)

| # | What | Why deferred | Exact later command / action |
|---|---|---|---|
| G0 | Stage A pilot + Stage B definitive gate | CA/CR not appointed (ROY-D1) | INT fills `docs/ADMISSION.md` |
| PC | Dev + held-out corpus, labels, OOS, scenes, lock | After G0 GO; CA authors, CR reviews | CA delivers `corpus/dev/` and custody; INT commits `corpus/heldout.lock.json` |
| R1 | Reconcile code/tests to card version v1.x if the pilot revises a card | After G0 | builder package; re-run the `docs/RULES.md` digest check |
| G1 | Full-corpus confirmation before freeze | After PC | INT + CR fill `docs/ADMISSION.md` G1 |
| F1 | `results/FREEZE.json`, held-out release, the one attempt, generated README/LIMITATIONS numbers | After G1 and L1 | `npm run materialize -- --split heldout --check`, then `npm run eval -- --split heldout` (once) |
| P1 | Publication, remote, Bolt import | Not authorized (ROY-D4) | — |

## M0 notes

- No measured number exists anywhere in the repo; every results cell reads "not yet measured" until F1.
- `package.json` scripts reference files later milestones create (`scripts/*.ts`, `test/setup/no-network.ts`, `src/viewer/main.tsx`).
- `index.html` carries no Content-Security-Policy yet: a strict `connect-src 'none'` / `script-src 'self'` meta would block Vite's
  dev-mode inline preamble and HMR socket. M4 decides whether to add a CSP to the production build only; verify in L1-8.
- `tsconfig.cli.json` compiles with `resolveJsonModule` under `NodeNext`; if M1 imports `config/rules.json` directly it needs an
  import attribute (`with { type: 'json' }`) or a runtime read in `src/cli/`. Verify in L1-5.
