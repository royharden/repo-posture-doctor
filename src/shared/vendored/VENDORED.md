# Vendored files (S26 Secret-Scan Triage)

Three files in this folder are byte-for-byte copies from S26 Secret-Scan Triage (`Bolt.New\secret-scan-triage\secret-scan-triage`),
commit `e971a5622947144d51f1fd5b7ca553bbf27e1a95` (`e971a56`), which is MIT-licensed (notice below). They are never edited.
`.gitattributes` marks `src/shared/vendored/** -text` so the bytes survive `core.autocrlf=true`.

| File here | S26 source path at `e971a56` | git blob id | sha256 of the bytes |
|---|---|---|---|
| `rng.ts` | `src/core/rng.ts` | `9f8d9161bfec8fb95a971da18f57ab7354519a2e` | `1087f670fdd861635368fa5dcbcfe42a3402b95fdb99d3f4451dc01e50571b0e` |
| `wilson.ts` | `src/core/evalkit/wilson.ts` | `e3d564ccdf4af67f79d51174a580f7b710b83e82` | `4ba6f55712d279c72ef2815e3ac0d267e439b2d695a57f6ff329a4edfd04481f` |
| `entropy.ts` | `src/core/features/entropy.ts` | `00b91a93307e1b7a377ca1daef2f5e7649d21363` | `7db8b03803273e9f364f4c9959f57f1d424a0e7653aa8025307e21ed2bf01cb1` |

Verified 2026-10-27 (M0, static): `git hash-object <file>` equals the blob id above for each file, and `sha256sum` of each file
equals `sha256sum` of `git -C <S26> show e971a56:<source path>`.

Re-check (read-only):

```sh
git hash-object src/shared/vendored/rng.ts src/shared/vendored/wilson.ts src/shared/vendored/entropy.ts
git -C <S26 repo> ls-tree e971a56 src/core/rng.ts src/core/evalkit/wilson.ts src/core/features/entropy.ts
```

## New S44 code in this folder (not vendored)

| File | Why |
|---|---|
| `types.ts` | Shim. `wilson.ts` imports `type { Interval } from './types.ts'`; S26's own `src/core/evalkit/types.ts` imports six S26-only modules, so it is not copied. The shim exports only `interface Interval { low: number; high: number }`, the same shape as S26's. MIT, as new S44 code. |
| `VENDORED.md` | This record. |

## Not vendored: bootstrap

S26 `src/core/evalkit/bootstrap.ts` is coupled to S26 metrics and types, so it is **adapted**, not copied (PLAN.md K16, K30):
the S44 group bootstrap is new code at `src/eval/bootstrap.ts` (M3), carrying an MIT attribution to S26.

## Runtime verification (deferred)

None of these files has been executed in S44. The [C] §8 conformance tests (Wilson(8,10) = [0.4902, 0.9433]; (0,10) = [0, 0.2775];
(10,10) = [0.7225, 1]; Shannon("ab") = 1, ("aaaa") = 0, the alphabet = 4.7004; same seed gives the same first 10 outputs; `fork`
streams independent) are authored in a later milestone and run only in live validation (docs/DEFERRED-VALIDATION.md). If any
fails, the functions are written fresh against the same tests ([C] §8).

## S26 licence notice (reproduced from S26 `LICENSE` at `e971a56`)

```text
MIT License

Copyright (c) 2026 Roy Harden

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
