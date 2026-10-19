# Native image smoke recovery

## Before state

The user approved CI image publication from exact source
`2fa7976031bd24cbfa646596c22586c1ad6992e7`. Run
[39320101643](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/39320101643)
published audit tag `node24.15.0-pnpm10.32.1-playwright1.62.1-r1` and `latest`.
The build succeeded, but native x64 job `118300860402` and native ARM64 job
`118300860584` both failed at Firefox launch with HOME `/github/home`, owned by
uid 1001 while the browser runs as root. The profile job was skipped.

Two exact new step-HOME regressions failed before repair (2 failures, 2 other
policy tests passed). This is a VD-GOV-013 implementation defect, not a browser
assertion failure. No prior smoke pass or complete profile is claimed.

## Immutable identities and scope

- Multi-platform: `sha256:d96587d3f3eed2d1cbe63593566813b5f255576a28f27595dec6bb35e9936b71`.
- AMD64: `sha256:ca5827c45a2ddabf31e421e3a4664d4da7d4d3214b3716573f10fb7ddf0144e0`.
- ARM64: `sha256:661cb2485c34efc928a3ab2b64b867ee02908a71145f6a2d8a61d6febfb8abc4`.
- Source lock: `7aef952f349b6fcc06b924d521d27cf9a6df1728d3d84c1e317032b99166d189`.

Anonymous Buildx inspection confirms the public index and native child identities.
The ARM64 configuration reports the approved source label. The new manual
verification-only workflow checks both labels, exact source checkout, audit-tag
binding to the explicit digest, and embedded lock hashes. It grants only read
permissions, performs no build or publication, and reuses the producer's complete
native smoke and profile acceptance. A regression prevents those jobs drifting.
The producer restores step-scoped HOME and verifies the embedded lock too.
VD-GOV-012 explicitly admits this recovery; VD-GOV-013 remains unchanged.

No published bytes, baselines, package versions, audit exceptions, or capture
profile pins change here. npm publication is unapproved. Profile promotion still
requires native proof and the ARM64 browser canary on the dependency candidate.

## Validation and remaining work

Focused local and hosted results are recorded before landing. Local Node is
26.9.0; required hosted Node remains 24.15.0. This changes shared CI producer
infrastructure, so all five existing required PR checks must pass on the exact
candidate. Successful read-only native recovery remains distinct from source CI.

- `node --test scripts/ci-image-publication-policy.spec.mjs` before the HOME
  repair: 2 pass / 2 fail. The two failures identify the exact launching steps.
- After repair, the focused policy and image-contract suites pass 35/35.
- `actionlint` initially flags SC2155 for combined export/assignment in recovery;
  separated assignment/export, then both changed workflows pass lint.
- `CI=true corepack pnpm@10.32.1 install --frozen-lockfile --ignore-scripts`:
  passes on unchanged main dependencies.
- `corepack pnpm@10.32.1 spec:check`: all six lanes pass; 94 script tests,
  architecture budget, image contract, validation, mdBook and spec-first pass.
- `corepack pnpm@10.32.1 typecheck`: pass.
- `corepack pnpm@10.32.1 test`: 551 tests / 116 files pass.
- `corepack pnpm@10.32.1 build:node`: pass; executable CLI prepared.
- Local browser suites are not duplicated: all five hosted required checks
  qualify this workflow-only source before landing. Native recovery follows
  against the already-published digest, without rebuilding or republishing.
