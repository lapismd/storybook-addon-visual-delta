# Visual Delta version control and history

This reference defines read-only baseline history, mutation change sets, Git and Jujutsu support, auto-accept, local commit gates, safety checks, and prohibited repository operations.

## Normative requirements

These requirements allow local history and commits without widening repository authority.

| ID         | Requirement                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-VCS-001 | Opening baseline history MUST be read-only. Jujutsu history reads MUST ignore the working copy, and Git history reads MUST avoid index or working-tree mutation.                                                  |
| VD-VCS-002 | Every UI-driven mutation MUST record one exact change-set operation with stable before and after evidence for declared files.                                                                                     |
| VD-VCS-003 | Plugin-managed commits MUST require project workflow mode `review` or `auto`, host `allowVcsWrites: true`, a supported repository, and a complete safe change set. Defaults MUST keep both automation layers off. |
| VD-VCS-004 | A commit MUST include one complete Visual Delta change set. Pre-existing edits, unexpected paths, changed files after capture, failed operations, or a changed base revision MUST block it.                       |
| VD-VCS-005 | Visual Delta MUST NOT push, amend, squash, rebase, create or move branches or bookmarks, discard changes, reset unrelated state, or commit only part of an interdependent change set.                             |
| VD-VCS-006 | Auto-accept and automatic commit MUST remain separate opt-ins. A passing comparison cannot authorize a repository commit, and a commit setting cannot authorize review approval.                                  |

## Baseline history

The history view resolves the exact baseline path before querying version control. It supports:

- Revision metadata with stable and secondary identifiers
- The working-copy PNG when present
- Historical PNG bytes
- Revision-to-revision image comparison
- Source changes for the owning component folder
- Pagination and repository-specific warnings

When both `.jj` and `.git` exist, Visual Delta prefers Jujutsu. Jujutsu displays change ID as the primary identifier and commit ID secondarily. Git follows file renames; the current Jujutsu adapter reports history for the resolved path and states that rename limitation.

A shallow Git checkout MAY return partial history and MUST expose a warning. Invalid revision IDs, traversal, and paths outside the snapshot root MUST fail.

## Change sets

Middleware records mutation state under the disposable Visual Delta cache. One change set contains:

| Field         | Meaning                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| Stable ID     | Identity used by review and commit routes                                                |
| Base revision | Repository state before the mutation                                                     |
| VCS kind      | `jj`, `git`, or unavailable                                                              |
| Operations    | Action, scope, story IDs, success, and error                                             |
| Files         | Path, added or modified or deleted state, hashes, binary flag, before and after evidence |
| Mode          | `off`, `review`, or `auto`                                                               |
| Commit state  | Pending, blocked, failed, or committed                                                   |
| Block reasons | Concrete safety failures                                                                 |

Change-set evidence is local and disposable. It does not replace the repository or baseline artifacts.

Separate successful operations MAY join one pending change set only when they share the same base revision and repository. The resulting commit must still represent a coherent complete Visual Delta change set.

## Commit gates

All conditions must pass:

1. Project workflow mode is `review` or `auto`
2. The Storybook host sets `allowVcsWrites: true`
3. Git or Jujutsu remains available and matches the recorded kind
4. The base revision still matches
5. Every current file hash matches the captured after hash
6. Every changed path was declared by the operation
7. No changed path contained unrelated edits before Visual Delta touched it
8. Every operation succeeded
9. The commit message is non-empty

`review` permits a human-triggered local commit. `auto` attempts the same guarded commit after a successful mutation. A failed automatic commit leaves a reviewable change set and reports the error.

## Jujutsu behavior

Jujutsu commits use path-scoped `jj commit`. History reads use `--ignore-working-copy` so opening the panel cannot snapshot or alter the working copy.

Visual Delta MUST preserve changes outside the change set. It MUST not assume Git staging semantics in a Jujutsu checkout.

## Git behavior

Git commits use path-limited commit behavior. New files MAY receive intent-to-add only as part of the guarded operation, and temporary index effects MUST be cleaned up if the commit fails.

Visual Delta MUST account for working-tree, index, and untracked changes when detecting pre-existing edits. It MUST not stage or commit unrelated paths.

## Automation boundaries

`workflow.autoAcceptLiveStoryComparisons` applies only to a fresh exact-story Chromium result classified as passed or changed within tolerance. It does not apply to HTML comparison, scoped runs, baseline writes, stale sidecars, missing baselines, or errors.

Changing workflow configuration is always review-only. It cannot cause the configuration mutation itself to auto-commit.

Related contracts: [Mutations and review](./mutations-and-review.md), [Interfaces](./interfaces.md), [UI catalog host profile](./host-profile.md), and [Verification](./verification.md).
