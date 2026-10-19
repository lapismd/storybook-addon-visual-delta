# Verified immutable GitHub release completion recovery

## Observed boundary

The exact 0.0.8 publication run 39337032314 passes source/package/ARM64 and
protected npm publication at source 4a4a2f05df6336d7383546a0ebc4f8b925b53b8e.
Public metadata and then tarball visibility lag. Attempt 1 times out on metadata;
attempt 2 fails installation on tarball 404. Once both exist, only failed
verification jobs rerun: attempt 3 installs from the registry and passes npm
signature/Sigstore verification. Its downstream GitHub release remains skipped;
rerunning that job alone also leaves it skipped. Published npm bytes and tag
remain unchanged throughout.

The public archive independently matches SHA-256
`3d3c126cf7309e12ac1bc86adbad7ef97ffd67539cceb48f36a18b9068566bd5` and
reviewed tar payload
`6f3aa1c5af1bf61448c823e58be3bec866acbdcde4017fa10cad5cba94d65ff1`.
Sigstore's npm PURL SHA-512 and resolved Git commit match those public bytes and
the exact approved source. Isolated registry installation audits clean; CLI,
Node/runner exports and read-only Design Core/Desktop planning canaries pass.

## Owned correction

VD-GOV-009 completion now explicitly overrides skipped bootstrap ancestry with
`always()` while requiring successful package and provenance dependencies.
One shared Node-only completion script verifies the existing tag, original
canonical tag-push publication run and four successful exact-source release
jobs before creating only a missing public GitHub release. Existing public
releases are retained without edits. Failed/incomplete/mismatched evidence or
unapproved recovery rejects before writes. Unknown outcomes recover by reading
the existing release on the next approved attempt.

The default-branch manual recovery is separately explicit, defaults false and
contains no npm publishing, tag mutation or registry token. It reads already
qualified publication proof with `actions: read`; `contents: write` permits
only the final release operation in the script. It uses CI-image Node 24.15.0
and no package dependency graph or installation. Current npm bytes, version,
lock, tag, source approval and the consumed bounded exception are unchanged.

VD-ARCH-006 is unchanged. Extract the private workflow-contract table and lower
its oversized checker budget from 619 to 559. New files remain below their
existing budgets; no growth allowance or assertion is weakened.

## Actual validation

- Before normal workflow wiring: 20 completion cases pass and the one skipped
  bootstrap condition regression fails. After: all 22 completion cases pass.
- A combined exact check initially rejects the recovery's missing generic image
  declaration; add the required declaration rather than weakening the guard.
- Architecture correctly rejects the extracted checker's stale 619 budget;
  lower it to actual 559 in the same change.
- `pnpm spec:check`: all six lanes and 152 repository script tests pass.
- Actionlint without ShellCheck passes. The existing intentional SC2016 npm
  token placeholder is unchanged and previously reproduced from main.
- The actual existing tag/run/latest-job API responses pass the new completion
  validator with no write. Negative cases cover fork/unapproved/other branch,
  malformed identity, moved tag, wrong workflow/source, truncated jobs and
  failed or skipped gates. Idempotent existing-release handling is covered.

All five protected source checks remain required before dispatching recovery.
The original tagged workflow cannot be rewritten. The manual workflow will
qualify completion of this existing release; a future first-attempt npm release
remains its own end-to-end release gate.
