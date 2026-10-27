# Bolt handoff — inspection only

**Source construction complete only when the outer status says accepted; runtime unverified.** No remote exists. No import,
provisioning, publication or deployment is authorized. This document is an inspection/preparation prompt, not a deployment receipt.

## Import target and inventory

Import only this inner repository when the owner authorizes it. The outer coordination shell is not product source.
Stack: React + TypeScript + Vite, static report viewer. The offline Node CLI runs on the user's machine; Bolt does not scan
local repositories or reach local filesystems. Local report files are chosen explicitly in the browser and are never uploaded.

| Resource | Requirement |
|---|---|
| Database | Not required |
| Functions | Not required |
| Auth | Not required |
| Storage | Not required |
| Realtime | Not required |
| Secrets | Not required |
| Backend migrations | None |
| External services/models | None |

Build command after authorized setup: `npm run build`. Output: `dist/`. The local CLI uses `npm run build:cli`, output
`dist-cli/`; it is not a hosted backend. Node version is declared in `.node-version`. No lockfile exists because dependency
installation is forbidden during current construction mode; installation, lockfile, typecheck, lint, tests and builds are
pending owner activation. Do not assume this source has passed a build or is ready to deploy.

## Later acceptance

After the owner authorizes validation: resolve/install declared dependencies and commit the resulting lockfile; typecheck,
lint and run authored controls; build both CLI and viewer; exercise local report import, invalid imports, size limits,
text-only malicious-string rendering, filters, coverage and accessible keyboard interactions. Confirm no report-induced
network requests. Claim any local development-server port before starting it. Review all deferred checks in
`docs/DEFERRED-VALIDATION.md`. Independent corpus admission/evaluation remains a separate prerequisite for measured claims.

## Prompt for a future authorized Bolt inspection

Inspect this repository's static React/Vite report viewer and BOLT-HANDOFF.md. Preserve the offline CLI/viewer separation
and text-only local report import. No database, functions, auth, storage, realtime, secrets or provider calls are required.
Do not provision, publish or deploy. Identify concrete dependency, build or import gaps and report them with proposed source
fixes. Do not invent measurements, replace the illustrative report with an alleged scan, or copy outer agent records into the
app. Ask the owner to authorize any later import or publication action.
