# Gitleaks comparator — not yet measured

There is no receipt, binary, pinned release, default-config digest or capture. An absent receipt means **not yet measured**, never zero findings. A schema, hash, config or mapping mismatch means **invalid measurement**.

Normal-mode activation must pin an official release, verify its `dir --help` and README, hash the binary/default config, and freeze exact rule IDs in mapping.json. The current mapping is deliberately pending. Map provider rules to secrets.provider_key; generic-api-key may map partially to secrets.secret_assignment; a verified JWT rule may map partially to secrets.service_role_jwt. Env metadata and public names are N/A. Count unmapped findings and keep OOS exploratory; never pool incompatible scopes.

Capture in a clean temporary copy of the synthetic materialized split, with no repository .gitleaks.toml and no environment overrides. Proposed argv (verify every flag against the pinned binary first):

```text
gitleaks dir <temporary-synthetic-split> --report-format json --report-path <raw-outside-git> --redact=100 --no-banner
```

Record all receipt.schema.json fields, including exact argv/cwd/platform/exit status and binary, default config, corpus, mapping, raw and sanitized digests. Sanitized bytes are `JSON.stringify([{rule_id,path,line,end_line}, ...]) + '\n'` in capture order. Only those four fields survive; Secret, Match, source lines and fingerprints never enter committed output. Raw reports stay outside Git. The importer checks receipt pins and guards sanitized outputs against planted values. Tests, download and capture remain deferred in Dirty Mode.
