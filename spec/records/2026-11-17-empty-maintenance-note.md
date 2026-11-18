# Bounded empty coordinator maintenance notes

The source regression belongs to VD-GOV-019/020. Base main is
`e755e2a054967b874f25c5d620ddf490da6ecc59`. The real compressed registry fixture
updates only development validator0.2.0 to0.2.1. Adding the coordinator's actual
`---\n---\n\nbody` note format previously failed the five-path scope guard.

The independent source parser now admits at most one regular
`.changeset/lapis-dependencies-<12 lowercase hexadecimal digits>.md`, with an
8192 byte UTF-8 limit, blank or empty-map YAML frontmatter and a nonempty body.
The source guard still independently checks all five managed paths, forward
supported SDK movement, catalog/dependency edges, unchanged public metadata,
immutable version integrity, opt-in policy and managed chapter slots. The
coordinator separately owns its exact branch-derived note identity. The source
CLI reads only regular matched notes into the actual candidate.

Validation on Node24.15.0, pnpm10.32.1 and Deno-free spec-validator0.2.1:

- Exact generated-note regression: one failure before the fix, zero after.
- Focused source suite:43 passed. Blank/empty-map/CRLF/exact8192byte notes pass;
  release bumps, null, arrays, scalars, malformed/unknown-tag/duplicate YAML,
  missing bodies/bytes, multiple/duplicate/arbitrary note paths, oversized ASCII
  and UTF-8 bodies and unrelated source changes fail closed without mutation.
- Real isolated JJ history verifies the generated regular note, refuses a
  symlink and rejects a directory containing a candidate child. An earlier test
  wrongly expected an untracked empty directory to be a VCS mutation; it failed
  once, then was corrected to exercise a real nested candidate path. The source
  guard and its scope assertion remain strict.
- Complete `pnpm check`:131 files/619 package tests and207 repository script
  tests pass; all8 specification lanes, mdBook, source-range checks, typechecks,
  architecture, Node build and publint pass. Publint retains its existing
  repository URL suggestion.
- Explicit `pnpm check:architecture` and `pnpm build:node` pass. QMD conceptual
  discovery passes; doctor reports10 passes and the known script-alias warning.

No package manifest, lockfile, package version, managed facts, callback pin,
version qualification, audit approval or visual baseline changes. This is
workflow maintenance with no release intent. Publication-only advisory policy
and all existing publication/baseline gates remain unchanged. Fresh exact-head
hosted package, native and browser CI remain required before ordinary merge.
The parent's shared repeat-preparation proof remains separate until its reviewed
coordinator fix is supplied; this source repair does not claim that proof.
