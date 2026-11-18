# Dependency automation

VD-GOV-019 and VD-GOV-020 govern the shared integration. Only the development
specification-validator coordinate may move through the reviewed patch channel.
Public package exports, peers, dependencies and all release/baseline gates
remain unchanged. The independent guard runs in normal package CI and outside
trusted-bot specification exemptions. The five managed input/chapter paths MAY
also carry at most one regular coordinator note named
`.changeset/lapis-dependencies-<12 lowercase hexadecimal digits>.md`. Its complete
UTF-8 source MUST be at most 8192 bytes, with YAML frontmatter that is blank or an
empty mapping and a nonempty Markdown body. Explicit null, scalar/array/nonempty
release maps, malformed YAML, missing body, multiple notes and arbitrary
Changeset paths MUST fail closed. This note supplies maintenance explanation
only, never package release intent; every existing catalog, public-contract,
immutable-integrity, managed-slot and source-scope check remains required.
The regular-file regression MUST run in the existing package/specification
image without a Jujutsu installation. Filesystem safety and complete candidate
verification remain exercised; separate ancestry tests cover read-only Git and
Jujutsu command selection. Managed catalog facts follow below.

<!-- dependency-intake:validator-development:start -->

```json
{
  "schemaVersion": 1,
  "kind": "development-dependency-intake",
  "dependency": "@lapismd/spec-validator",
  "version": "0.2.1",
  "peer": null,
  "integrity": "sha512-aHLByppZkay1axSm8KvCwOJz0si8aDyZBXDGWW+d2VQw+66f1KLimw2rEMjYIpLdoSG9+yN5Kd1MKlAJw7xUVw==",
  "importers": {
    ".": {
      "specifier": "0.2.1",
      "version": "0.2.1"
    }
  },
  "policySha256": "5a4682eb816c8a45d7da0f52000e1ccb8141bcae159ab97a0a4b2df2867fa442"
}
```

<!-- dependency-intake:validator-development:end -->
