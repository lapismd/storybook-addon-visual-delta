# Exact-source CI image bootstrap

## Failure reproduced

Dependency PR #28 at `a537526d369533ffb5c24cdd62cdb786ae3d1583` passed its
hosted package type/unit lane, but four checks failed. Hosted logs confirm:

- Specification: 81/82 script tests pass; the image configuration test rejects
  both 1.62.1 Playwright pins because the current profile still uses 1.61.1.
- Panel: 13 tests fail before launch, missing Chromium headless shell 1234.
- Manager: 55 tests fail before launch for the same missing executable.
- Browser matrix: 3 launch failures for Chromium 1234, Firefox 1538 and
  WebKit 2336, absent from the existing immutable image.

Runs: `39317664256` and `39317664257`. These are infrastructure mismatches,
not evidence that browser assertions passed. Re-running unchanged jobs cannot
resolve them. The two unpatched audit findings are a separate release blocker.

## Narrow source repair

This bootstrap is based independently on main
`b236a007cc35f9ece1150474726f306b57449d7c`, preserving the qualified Playwright
1.61.1 dependency pins, image/profile locks and all current browser gates.
It prepares the image producer before the dependency candidate needs it.

VD-GOV-012 now requires manual publication approval for a full exact source SHA,
checkout verification, paired exact browser versions and protected `ci-image`
review. A false input cannot publish. Publication still dispatches only from
the default branch, but can explicitly select a reviewed unmerged candidate.
The metadata helper runs in the existing pinned Node 24.15.0 image; no host
Node setup or consumer browser installation is introduced. Build arguments and
native smoke bind to the selected Playwright version. Image labels and the
profile artifact retain selected source and lock identity.

The Docker build now copies the portable workspace configuration alongside the
manifest/lock so frozen installation retains the existing security overrides.
Its allowlisted context remains narrow. Publication policy snippets are
extracted from the oversized checker, lowering its counted-line ratchet from
653 to 619 without raising a limit. New source and workflow guards have direct
regressions; future helper/policy edits require spec-first review.

No publication workflow is dispatched in this slice. No tag, npm package,
capture-profile promotion or visual baseline change is authorized by this source
preparation. The new source bootstrap does not itself fix #28's required browser
jobs: its reviewed image must be approved, built, native-smoked and canaried,
then actual provenance/digests must be locked in #28 before merge.

## Actual local verification

- Before: all failure logs above were read back from exact hosted jobs.
- `node --test scripts/check-ci-image-source.spec.mjs scripts/check-ci-image.spec.mjs`:
  33 pass, including rejected approval, floating/changed SHAs, unpaired browser
  versions, missing publication/environment/provenance guards and omitted
  workspace configuration.
- Initial architecture check correctly rejected a stale budget after extraction;
  lowered the checker ratchet rather than changing the limit. A subsequent
  check rejected growth of the existing test file; moved the new publication
  tests to their own file, preserving that original ratchet too.
- The first formatter invocation found no local Prettier binary. Re-ran only
  the edited files with Desktop's existing formatter, without dependency edits.
- `CI=true corepack pnpm@10.32.1 install --frozen-lockfile --ignore-scripts`:
  restores this bootstrap's original main dependency graph.
- `corepack pnpm@10.32.1 check:architecture`: pass after the extraction.
- `corepack pnpm@10.32.1 spec:check`: all six lanes pass, including all 88
  repository script tests, canonical validation, image contract, mdBook and
  spec-first. `corepack pnpm@10.32.1 typecheck`: pass.
- `gh api` environment read initially returned 404. Created `ci-image` with
  required reviewer `stevejuma` and a main-branch-only deployment policy;
  GET read-back confirms both protections. No deployment approval is granted.
- Local Docker has no cached copy of the pinned metadata image. Its pull,
  image build and native smoke remain hosted publication qualification; no
  expensive duplicate local image build is claimed.

Local Node is 26.9.0; hosted checks retain 24.15.0. This changes shared image
producer infrastructure, so the existing complete package/spec/browser CI lanes
must qualify the exact bootstrap head before landing, even though browser pins
and product source are unchanged. No local browser or snapshot run substitutes
for those checks.

## Remaining work

Qualify and land this producer-only source through protected checks. Merge its
source into the dependency candidate without rewriting the existing public
branch. The protected image environment is configured and verified. Present exact
candidate SHA, lock, image audit tag, checks and limitations for separate image
publication approval. Keep the npm audit/publication decision independent.
