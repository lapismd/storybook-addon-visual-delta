# Baseline history implementation

Visual Delta will expose read-only baseline history from the checkout's active
version-control system and reuse the existing compare tools for revision
inspection.

- [x] VCS detection, normalized history service, and guarded image endpoint
- [x] Baseline History panel with working-copy and revision metadata
- [ ] Image-to-image comparison, stories, browser acceptance, and docs

Decisions:

- Prefer Jujutsu when both `.jj` and `.git` are available.
- Read working-copy PNG bytes from disk; use `jj --ignore-working-copy` for
  committed history so opening the panel never snapshots the checkout.
- Show JJ change IDs as the stable primary identifier and commit IDs secondarily.
- Git follows renames; JJ v1 reports history for the resolved path.
- Keep history read-only and never mutate visual review status.
