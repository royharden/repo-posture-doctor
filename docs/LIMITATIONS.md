# Limitations

Construction only; runtime unverified. Error rates and failure counts are **not yet measured**.

| ID | Preregistered failure family | Count |
|---|---|---|
| F1 | Concatenated or encoded secrets | not yet measured |
| F2 | Sequential or alphabet-like strings | not yet measured |
| F3 | Realistic-shape placeholders | not yet measured |
| F4 | Unlisted formats and neutral names (OOS) | not yet measured |
| F5 | Dynamic SQL, DO or rename; expected unknown | not yet measured |
| F6 | Drop and recreate | not yet measured |
| F7 | Non-literal always-true policies and restrictive neutralisation | not yet measured |
| F8 | Tests asserting nothing | not yet measured |
| F9 | test:unit without test | not yet measured |
| F10 | Reusable or external CI | not yet measured |
| F11 | Internal loggers with other names | not yet measured |
| F12 | Comment-only intentional catches | not yet measured |
| F13 | Environment files with blank values; present does not mean committed | not yet measured |
| F14 | Template dependence and scenario-group effects | not yet measured |

The scanner reports literal static observations, not exploitability, credential validity, test quality, monitoring quality or
RLS effectiveness. Missing evidence is bounded to the scanned scope. Monorepos are treated as one root package.
Git history, injection surfaces, health endpoints, CVEs, Actions security, public anon keys and new provider formats are not checked.

Workflow parsing supports a conservative YAML block subset. Unsupported flow collections, aliases or structures must return
unknown; supported workflows still require runtime controls after Dirty Mode closes. SQL covers the documented statements;
dynamic SQL and unsupported changes force unknown. The walker assumes a quiescent directory; it rejects links/redirects and
checks opened file identity, but it is not a sandbox for a hostile concurrent writer. Windows junction/reparse behavior,
platform file identities and all scanner/editor seams remain unverified until L1.

Independent corpus appointment, G0/G1 admission and the one-use held-out protocol remain pending. No trust badge, grade,
safety certification or measured improvement is claimed. Each later failure count must come from frozen prediction–label joins
plus a reviewed reason in results/ADJUDICATION.md; never infer counts from these listed limitations.
