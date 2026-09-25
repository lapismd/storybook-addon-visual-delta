---
---

Add the VD-ARCH-006 counted-line architecture checker as repository validation
tooling. This records explicit empty release intent: the new
`check:architecture` script, `scripts/architecture-*.mjs` checker modules,
`scripts/architecture-baseline.json`, fixtures, and the two
`spec-validator check` lanes are development gates only. No published runtime
export, CLI surface, or consumer-visible behavior changes, so no version bump
is required.
