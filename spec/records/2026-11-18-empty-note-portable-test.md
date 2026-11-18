# Empty-note filesystem regression in the existing CI image

PR 81's specification run 44201020930 failed one of 207 script cases:
`real source reader verifies the regular generated note and rejects symlinks/directories`.
The new test tried to initialize a disposable Jujutsu repository, but the
existing specification image intentionally has no `jj` executable. The failed
case reported `spawnSync jj ENOENT`; the other 206 cases passed.

The regular-file reader is now a private source module used by both the actual
intake guard and the filesystem regression. The regression exercises real
regular files, symlinks and directories and passes the complete candidate to
the independent verifier. Existing separate tests retain both read-only Git
and Jujutsu ancestry command contracts. No new image/tool installation, skipped
case, audit exception, dependency, lockfile or public package contract is added.

Validation on Node 24.15.0 and pnpm 10.32.1:

- Exact failing test with `PATH=/usr/bin:/bin` (no Jujutsu): one passes, zero fail.
- Aggregate `pnpm spec:check --base e755e2a054967b874f25c5d620ddf490da6ecc59`:
  all 207 script cases and eight specification lanes pass.
- `pnpm check`: all 619 product cases, all 207 script cases, types, eight
  specification lanes, Node build and publint pass. The existing repository-URL
  suggestion remains advisory.
- Architecture budgets pass; no baseline files or thresholds change.

The earlier cancelled Ubuntu native run remains distinct from this portability
failure. Fresh current-head native and browser CI is required after the push.
