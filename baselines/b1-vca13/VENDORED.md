# B1 pinned code provenance

Commit: `fe0a10016ac8fef46d8fa66e080b03f087fad84d`. Original files copied byte-for-byte. No LICENSE exists at this pin; reuse rests on Roy's S44 authorization. These files are excluded from S44's new-code MIT grant. Existing notices are preserved.

| File | Git blob | SHA256 |
|---|---|---|
| supabase/functions/_shared/auditors/secrets.ts | `eafd0b7584a535d4f2c63ced668b77a8d45b28f7` | `b9a4dc655074810eabd00a5de3bf2f61aa477f50160fe197d0718a58814f0e41` |
| supabase/functions/_shared/auditors/auth.ts | `f4d7f883e0029e633b3febb466f09c46f10b19d6` | `f564d7fe75cc8b6457c3d33f26045984cebecbd6d2c07bc68f480da2836e714a` |
| supabase/functions/_shared/mask.ts | `47c596e28f27a89aa1e4dcefd6ccda36c688ab22` | `c57a10598b191d590b6b5b3ac18b00e3045252766060425bbce81b0e560bdb8f` |
| supabase/functions/_shared/fetch-target.ts | `99349e3c8db61148bb03e71c9bcbe381e04f9ac1` | `17941a9ad0031a3f3966b8ffc676bb904b92017998117c9378b8153f14190d32` |

## Verbatim fetch-repo.ts selection excerpts

Each excerpt retains exact source bytes between marker comments in selection.ts. Wrappers replace network fetches with disk text only.

| Lines | SHA256 |
|---|---|
| 3-4 | `a377039b20b9846d8e20dcc25c0c9d1f17763c202767fef91b315bae86538b57` |
| 29-46 | `6a8feebb37d2c588a7709a867ffff592dfce43da715af2353dca14f2cbc1b45f` |
| 71-83 | `16919f8dcf3a51ef9ee847edd8be7e7aa6f7d91e1701a97cfae32265a9415094` |
| 99-115 | `44fdc2af151f65d5b4ee0c63d8e0a5e93082a32f26d1c70afd8d547c5c3925e1` |

Assumptions: disk inventory lists regular blobs sorted by slash-normalized relative path before the pinned stable sort. `size` is on-disk bytes; decoding is UTF-8 with replacement. Read errors refuse the case rather than silently dropping it. Pinned mode is `repo`. The selected input is restricted to corpus/.out. Non-template env text is read only from synthetic materialized cases; the adapter never receives a live repository. Evidence, context, title, and secretHash are dropped before safe output; only rule_id/location are mapped. The env map is partial. Tests/observability are N/A.

The copied fetch-target.ts is loaded only to obtain MAX_TOTAL_TEXT_CHARS; its top level declares constants/functions and does not fetch. Network entrypoints are never called. deno-shim.d.ts, adapter.ts, selection.ts wrappers and pins.json are new S44 code. Verification, B1 execution and captures remain deferred under Dirty Mode.
