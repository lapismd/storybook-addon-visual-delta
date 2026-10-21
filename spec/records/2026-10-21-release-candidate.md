# Qualify a release archive before requesting publication approval

Date: 2026-10-21. Revision: enclosing Jujutsu change. Publication is unapproved.

Mira needs the cold Linux correction proposed for Visual Delta 0.0.9. Existing
`release.yml` builds the final versioned archive only on `create_tag=true`.
That cannot safely prepare a reviewable candidate before publication approval.
The false/default dispatch deliberately creates neither archive nor tag.

Preserve VD-GOV-008/009/016 and extend the package-release procedure with
`qualify-release.yml`. It accepts only manual canonical-main dispatch, checks
full source identity and main ancestry before installing candidate tooling,
requires a completed Version Packages source with no pending Changesets, and
runs the ordinary package/specification checks. It uses the already qualified
immutable x64 CI image and minimal contents/packages read permissions. It has no
publication environment, release credential, write permission or tag/npm upload
command. Existing approved-tag and protected OIDC publication paths are intact.

The candidate lane runs full/production audit policy, retains the archive and
source/lock/archive/payload receipt, inspects the executable CLI and license,
and installs that same archive outside the checkout with isolated npm config.
Its CLI and Node/runner/Playwright exports must load and the consumer must audit
clean. Evidence is retained even after failure; failure remains a failed gate.
Browser release gates and public registry/provenance verification remain
separate and mandatory. The consumed 0.0.8 exception is not enabled.

## Local commands and results

- Initial `node --test scripts/check-release-source.spec.mjs` fails one test
  file because the new candidate validator is absent. This records the missing
  qualification boundary before implementation.
- The same target now passes 10 cases. Existing approval, context, exact SHA,
  pending Changesets and Version Packages checks remain covered. Added cases
  prove qualification needs no publication approval, still rejects invalid
  candidates, cannot grant publication through workflow wiring, and rejects
  unknown CLI arguments.
- `actionlint .github/workflows/qualify-release.yml` and
  `node scripts/check-architecture.mjs` pass. Only touched script/workflow files
  are formatted using the installed development formatter; no dependency path
  enters published manifests.
- `corepack pnpm@10.32.1 spec:check` passes seven lanes and 158 script tests.
  Exact-range release intent reports no public runtime or manifest changes.
  Full package/browser checks are delegated to protected exact-source CI; no
  local browser/native build is run.

This is release preparation, not publication, visual approval or Mira consumer
acceptance. After source qualification, refresh existing Version Packages PR
#36, qualify its exact completed main source using this read-only lane, review
its hashes and artifacts, and obtain fresh publication approval. Then consume
the public correction in Mira and rerun real strict visual comparison.
