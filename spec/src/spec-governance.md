# Visual Delta specification governance

The user-authorized native staging follow-up consolidates the pending
dependency update PRs and generated 0.1.1 version PR. The combined candidate
MUST be generated through Changesets and retain ordinary package, browser,
native and consumer qualification. Superseded PRs may close after their exact
changes are incorporated and verified. This consolidation does not authorize
package publication, tagging, image changes or skipped release gates.

The cold Linux capture correction adds a native non-root ARM64 CI proof using
the existing immutable canonical image. It creates genuinely root-owned private
stage files, proves ordinary host deletion fails, and verifies bounded recovery
preserves external user data. The image, browser profile and release approval
policy remain unchanged; no new image is published.
This separate host-only ownership probe uses pinned Node 24.15.0/pnpm 10.32.1
because a root-owned job container cannot prove non-root host deletion. Existing
package and browser jobs retain their authenticated image-only toolchain policy.
Maintained Changesets 3 and its changelog adapter retain the single-package pnpm
reader contract. Patched same-major Vite/Markdown-it development resolutions do
not authorize publication or transfer the consumed 0.0.8 audit exception.

Markdown linting uses the maintained `markdownlint-cli` driver through an
explicit specification check lane. It MUST preserve the original AGENTS,
DEVELOPMENT, README and `spec/src` scope, default rules, MD013/MD060 disables and
sibling-only MD024 configuration. Generated books remain outside that scope.
Removing the vulnerable CLI2 glob graph MUST NOT remove Markdown lint from
`spec:check` or relax its rule failures; both direct and aggregate lanes remain
required, with passing/failing CLI fixtures checking the retained behavior.
The driver's YAML and TOML dependencies remain on patched major 5 and major 1
respectively. These development-only pins preserve parser APIs and require a
fresh full audit; no audit exception is enabled by this migration.

This reference defines how the specification leads implementation, which changes require a specification update, and how local and continuous-integration checks enforce that contract.

## Normative requirements

These requirements prevent implementation, tests, and generated documentation from silently redefining Visual Delta.

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-GOV-001 | Markdown under `spec/src/` MUST be the canonical Visual Delta contract for humans and agents. Repository-owned configuration MUST map Visual Delta policy and requirement identifiers onto reusable shared validators while excluding auxiliary `VD-GAP-*` labels from unknown-requirement checks; generated output, implementation, tests, and non-canonical documentation MUST NOT override it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| VD-GOV-002 | Visual Delta implementation MUST never be ahead of the specification. A protected behavior or integration change MUST update the relevant canonical requirement before or in the same logical slice; a code-only behavior change is prohibited.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| VD-GOV-003 | An intentional contract change MUST update `verification.md` with focused evidence or a declared gap. Passing tests MUST NOT authorize behavior that the canonical specification does not define.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| VD-GOV-004 | The configured spec-first gate MUST cover portable production code and repository-owned Visual Delta host integration. Tests, fixture stories, ordinary catalog stories, visual baselines, derived artifacts, and generated output MUST NOT trigger or satisfy the gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| VD-GOV-005 | Local enforcement MUST inspect the current Jujutsu change, and pull-request enforcement MUST inspect the exact base-to-head change set. The pull-request workflow MUST fetch complete history and register the checked-out workspace as safe in the root-owned HOME used by its job container before invoking Git. Failure to determine the change set MUST fail closed and report the unresolved scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| VD-GOV-006 | A code-to-spec mismatch MUST be treated as an implementation defect unless an explicit specification change is accepted. Weakening a requirement requires rationale and MUST NOT be disguised by editing non-normative documentation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| VD-GOV-007 | The configured repository-layout validator MUST require exactly `AGENTS.md`, `DEVELOPMENT.md`, `README.md`, and `CHANGELOG.md` as package-root Markdown. The obsolete `specs/` tree and package-root historical contract or plan files MUST NOT exist. Links to normative content MUST target `spec/src/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| VD-GOV-016 | Public runtime and manifest changes MUST record Changesets release intent. Main pushes with pending Changesets MUST prepare a Version Packages PR without tagging or publishing. Tag creation MUST require explicit default-branch workflow dispatch approval bound to an exact 40-character source SHA. The checkout MUST equal that SHA, belong to canonical main history, represent a Version Packages commit or merge, and contain no pending Changesets. The exact stable version tag MUST retain existing immutable-tag checks and use a workflow-triggering credential. Ordinary pushes, forks and unapproved dispatches MUST NOT create tags. The versioning workflow MUST NOT publish npm packages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| VD-GOV-008 | A dependency-audit remediation that changes the Visual Delta package manifest or resolved dependency graph MUST upgrade reported vulnerable packages to patched releases and verify a clean `pnpm audit`, except the explicitly approved single-release 0.0.8 development-tool exception below. That exception MUST fail closed outside its exact advisory, package, version, source, lock, artifact, expiry and no-fix identities, retain raw full/production audits and every other release gate, and MUST NOT be inherited by another release. Audit work MUST NOT create, replace, or delete visual baselines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| VD-GOV-009 | A public npm release MUST originate only from an exact stable `vX.Y.Z` tag matching the package version, pass the release validation gates, verify that the packed artifact retains its executable CLI bin, and wait for protected GitHub Environment approval. Normal publication MUST use npm trusted publishing with GitHub OIDC and provenance, never a registry token. The release MUST install the published package on a clean runner and verify its Sigstore provenance with `npm audit signatures`; the verifier MUST bind the tarball SHA-512 through npm's canonical scoped-package PURL subject. Only after provenance verification succeeds MUST the workflow create or retain a non-draft, non-prerelease GitHub Release for the exact existing tag without moving or recreating it. Only `v0.0.1` MAY use a one-time bootstrap token, isolated to a separate protected Environment; that job MUST configure the public registry through an ephemeral user config containing only an environment-variable token reference, MUST still publish provenance, and the token MUST be revoked before the next release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| VD-GOV-010 | The canonical panel-baseline capture workflow MUST run only through manual dispatch from the default branch on `ubuntu-24.04-arm`, use the immutable ARM64 capture-profile image, and capture only missing browser-qualified panel references. Its job MAY grant `packages: read` solely to pull the image, plus `contents: write` and `pull-requests: write` solely to commit the exact verified PNGs to a new automation branch and open a review pull request; it MUST NOT write directly to the selected revision. Playwright's expected non-zero result while recording a missing reference MAY continue only to exact-set and compare-only gates; a successful job MUST upload exact PNGs, profile metadata, and checksums as a review artifact before opening the pull request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| VD-GOV-011 | Every repository-owned GitHub Actions job that executes package tooling MUST run Node.js `24.15.0` as supplied by the repository CI image. Every JavaScript action referenced by repository workflows MUST use a Node.js 24 runtime, and workflow validation MUST reject an action ref outside the audited Node.js 24 allowlist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| VD-GOV-012 | The repository CI image MUST be published to `ghcr.io/lapismd/storybook-addon-visual-delta-ci` only by a manually dispatched default-branch workflow with explicit publication approval bound to a full 40-character source SHA and MUST remain publicly pullable without registry credentials so the built-in consumer runner needs no GHCR setup. A publication MUST build Linux AMD64 and ARM64 from the reviewed Dockerfile, pin Node.js `24.15.0`, npm `12.0.2`, pnpm `10.32.1`, mdBook `0.5.4`, and Chromium, Firefox, and WebKit from the exact paired Playwright version selected by the approved source, reject `latest` or an existing image tag as its audit tag, verify anonymous audit-tag inspection, and verify both native architectures. Only after both native smoke jobs pass, it MUST emit a versioned capture-profile manifest containing the multi-platform and ARM64 child digests, the actual browser and tool versions reported by the native ARM64 container, a content-derived manifest hash of that container's fonts, and the canonical locale, time-zone, viewport, scale, and rendering settings. Publication MAY update `latest` for generic tooling, but canonical visual consumers MUST use the immutable ARM64 digest. The workflow MUST verify the checkout equals the approved source, require identical exact Playwright runtime/test versions, preserve pnpm workspace overrides in the frozen image install, and use a protected image-publication environment. An explicitly approved unmerged source MAY bootstrap a candidate image, but MUST NOT promote the canonical capture profile before native smoke and ARM64 canary qualification. The publisher MAY grant only `contents: read` and `packages: write` and MUST NOT create or update a baseline. A separate manually dispatched verification-only workflow MAY recover native qualification of an already published image; it MUST grant only read permissions, bind the audit tag to an explicit immutable digest and exact source, verify both child source labels and the embedded lock hash, and MUST NOT build, republish, retag, or alter a baseline. |
| VD-GOV-013 | Repository-owned package-tooling jobs MUST use authenticated CI-image job containers, minimal permissions, Bash, and the root-owned `HOME=/root` required by Firefox, without reinstalling image-supplied toolchains or browsers. The container declaration MUST set `HOME=/root`, and each run step that launches Firefox MUST restore `HOME=/root` at step scope because GitHub Actions can replace the container value with its uid-1001-owned runner home. Root HOME MUST NOT be set at workflow or job scope so the host Docker client retains its runner-owned configuration path. A container job that reads checkout VCS history MUST register `$GITHUB_WORKSPACE` as safe under that root-owned HOME after checkout; this includes the npm release package gate because `spec:first` reads Git. Specification, package, npm publication, provenance, and image-build jobs MUST remain on stable x64 runners. Panel, manager, browser-matrix, release visual acceptance, and canonical baseline capture MUST run on `ubuntu-24.04-arm` with the immutable ARM64 capture-profile image. The npm release workflow MUST split x64 package gates from ARM64 visual gates and require both before publishing. A checked-out dependency graph still requires `pnpm install --frozen-lockfile`. ARM64 visual jobs MUST be canaried successfully before becoming required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| VD-GOV-014 | The package Storybook MUST publish as a static, read-only GitHub Pages site at `https://lapismd.github.io/storybook-addon-visual-delta/` after a push to the default branch and on explicit manual dispatch. Its build job MUST use the authenticated x64 Node 24 CI image, Bash, root-owned container HOME, a frozen dependency install, and `pnpm build-storybook`; it MAY read Pages metadata but MUST NOT receive Pages write or OIDC permission, MUST force the package-owned baseline fixtures so an optional sibling host checkout cannot enter the public artifact, and MUST verify `storybook-static/index.html`, `iframe.html`, and `index.json` before uploading only `storybook-static` with the official Node 24 Pages artifact action. A separate `github-pages` deployment job MUST depend on that artifact, use a stable GitHub-hosted x64 runner, grant only `pages: write` and `id-token: write`, and deploy with the official Node 24 Pages action. The deployment MUST NOT execute visual comparisons or create, replace, delete, or approve a baseline. The package README MUST link to the stable Pages URL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| VD-GOV-015 | The compare-only Visual Delta CI workflow MUST run the same package, panel, browser-matrix, and manager jobs for pull requests, pushes to the default `main` branch, and pushes to the retained compatibility branch `master`. None of those triggers MAY enable snapshot updates or baseline mutations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| VD-GOV-017 | Repository agent guidance MUST resolve published LapisMD dependencies through npm semver ranges, keep external repositories outside this pnpm workspace, preserve portable published manifests, and route dependency defects to the owning repository before consuming a released version.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Authority and timing

Edit the canonical requirement before editing behavior. The specification and implementation MAY land in one logical commit or pull request, but the implementation must not establish an undocumented interim contract.

When intent remains unchanged, preserve the requirement ID. Add a new ID for a distinct obligation. Removing or weakening a requirement requires an explicit rationale in the change description.

If the implementation already contradicts the specification, either:

- Fix the implementation to conform, or
- Propose and review an explicit specification change before relying on the new behavior

Tests reproduce or verify the contract. They do not create it.

## Protected boundary

The gate protects:

- Portable production source and package configuration
- Visual Delta Storybook registration, middleware, baseline integration, and project configuration
- Playwright configuration and Storybook process supervision used by Visual Delta
- Repository-owned visual writers and shared command surfaces when their changed lines concern Visual Delta
- Spec enforcement scripts, command wiring, and continuous-integration workflow

The gate ignores test-only changes, test fixtures, ordinary component stories, committed component baseline PNGs, build output, caches, reports, and the generated mdBook. An ignored change that reveals or introduces behavior still requires a deliberate specification update under `VD-GOV-002`.

Only a canonical content page under `spec/src/` satisfies the gate. `SUMMARY.md`, generated HTML, package-root Markdown, or a document under the obsolete `specs/` path does not.

## Enforcement

Run the complete local policy check from the repository root:

```bash
pnpm spec:check
```

The component commands are:

- `pnpm spec:lint`
- `pnpm spec:validate`
- `pnpm spec:build`
- `pnpm spec:serve`
- `pnpm spec:first`

The complete check also runs configured repository-specific script and CI-image lanes. Shared checker regression tests remain owned by `@lapismd/spec-validator`. It runs near the start of `pnpm checks`, before implementation typechecking and browser validation.

On a pull request, the required **Visual Delta Spec First / Validate Visual Delta specification** check compares the exact base and head revisions. Its checkout fetches complete history and writes the workspace safe-directory entry after checkout, under the same root-owned HOME used when the checker invokes Git. Repository settings MUST keep that check required before merge. The workflow obtains Node 24.15.0, pnpm 10.32.1, and the prebuilt mdBook 0.5.4 binary from the repository CI image; it does not compile mdBook during a workflow run.

**Visual Delta CI** (`.github/workflows/visual-delta-ci.yml`) runs package typecheck and Vitest, panel, browser-matrix, and manager acceptance on pull requests and pushes to the default `main` branch or retained compatibility branch `master`. Spec First remains the contract merge gate; repository settings SHOULD enable the Visual Delta CI checks as required once they are stable on the default branch.

The gate reports every protected path when no canonical content page changed. If it cannot obtain or parse a trustworthy change set, it fails closed. Remediation is to update the relevant stable requirement and [verification evidence](./verification.md), not to add a token spec edit or weaken path protection.

Generated Version Packages pull requests apply release metadata that was already
authorized by merged Changesets. The pull-request Spec First workflow still
validates the generated branch, but a `package.json` version-only line change,
generated `CHANGELOG.md` entry, and deletion of consumed `.changeset/` files do
not require a fresh canonical chapter edit. Protected package-manifest behavior
remains guarded: scripts, Storybook and Visual Delta wiring, checks, repository
metadata, publish configuration, privacy, Playwright wiring, markdownlint/spec
tooling, and release commands still trigger Spec First when their lines change.
The generated release commit remains gated later by exact tag, package,
publication, provenance, audit, and clean-consumer checks.

Structural validation MUST reject a reintroduced `specs/` tree and any package-root Markdown set other than `AGENTS.md`, `DEVELOPMENT.md`, `README.md`, and `CHANGELOG.md`.

## CI image publication

The manually published CI image moves stable toolchain and browser downloads
out of ordinary package jobs. Its pnpm store is warmed from the reviewed
`package.json` and `pnpm-lock.yaml` with lifecycle scripts disabled, and mdBook
comes from checksum-verified upstream binaries rather than Cargo compilation.
A consumer still installs its checked-out lockfile before running package
commands. A stale image is therefore a cache miss rather than permission to
ignore the current dependency graph. Consumer jobs authenticate the image pull
with their repository `GITHUB_TOKEN`, receive only `packages: read` for that
purpose, and use Bash explicitly because container jobs otherwise default to
`sh`. They do not repeat toolchain, mdBook, Linux-library, or browser installs.

The required audit tag is an immutable operational record. `latest` is a
generic-tooling alias and MAY move only when the manual publication workflow
produces and verifies a new multi-platform manifest from the exact approved source. Dispatch remains restricted to the default branch; a separately approved candidate SHA can bootstrap a new browser image before its dependency PR merges.
The GHCR package is public, and publication verifies the audit tag through a
fresh Docker configuration without registry credentials before it can become a
reviewed profile. Repository workflows MAY continue authenticating pulls to
avoid anonymous registry limits, but consumers do not need a GitHub login.
Canonical visual jobs use the recorded ARM64 child digest, never `latest`.
The reviewed lock artifact is assembled only after the native AMD64 and ARM64
smoke jobs pass. Browser and tool versions and the content-derived font-manifest
hash come from the ARM64 job rather than the build host or declared dependency
metadata; the artifact also records the canonical capture context required by
`VisualCaptureProfile`.
The image's package-manager cache MUST use a fixed image-owned path so GitHub's
job-container `HOME` override cannot change the resolved pnpm version. Image
publication and native smoke commands use Bash explicitly.
Rebuild the image and update the reviewed capture-profile lock for a reviewed
dependency, Dockerfile, Node.js, npm, pnpm, mdBook, Playwright, browser, or font
change. Browser upgrades may bootstrap from an explicitly approved candidate SHA
before merge; the currently required profile remains unchanged until the new
image passes native smoke and ARM64 canary qualification. Publish the image before enabling jobs that reference its digest because
GitHub resolves a job container before any job step can run.

A failed post-publication smoke is a published-but-unverified outcome. Recovery
uses the existing immutable bytes through `verify-visual-delta-ci.yml`; both
native jobs and profile assembly retain the same acceptance as publication.
A runner-environment repair alone does not authorize replacing an audit tag.

## Package releases

The portable package is publicly released to `https://registry.npmjs.org`.
Authors record release intent with Changesets on pull requests that change
public package surface. Merges to `main` with pending Changesets open or update
a Version Packages pull request. Merging that PR does not create a public tag.
Before publication approval, the operator dispatches the read-only candidate
qualification workflow from main with the exact Version Packages source. It
MUST require canonical main ancestry, an exact checkout and no pending
Changesets, run package/specification checks and clean full/production audits,
and retain the inspected archive, source/lock/archive/payload identities, license
and isolated packed-consumer evidence. This workflow MUST have only read
permissions, no publication environment, no release credential and no tag or npm
publication command. Qualification is not publication approval.

After reviewing the exact candidate, the operator dispatches the release
workflow from `main` with `source` set to its full SHA and `create_tag=true`.
The default is false. The approved checkout must belong to canonical main
history, consume every Changeset and represent either a Version Packages
commit or its GitHub merge. Only then may the existing immutable-tag guard
create the matching stable `vX.Y.Z` tag. npm publication retains its separate
protected environment and qualification gates.

The npm publish workflow accepts only pushed `v*` tags; its release guard
rejects a tag that does not exactly equal the stable package version, a private
package, an unexpected package identifier, or incorrect public-registry or
repository metadata. It runs the specification, build, typecheck, unit,
dependency-audit, package dry-run, and compare-only browser gates before
publication.

The package gate verifies that the packed artifact still exposes an executable
`visual-delta` command. The `npm` GitHub Environment MUST require reviewer
approval and be registered
with npm Trusted Publisher for
`lapismd/storybook-addon-visual-delta` and
`.github/workflows/npm-publish.yml`. The `npm-bootstrap` Environment is the
one-time `v0.0.1` exception and is the only environment permitted to expose
`NPM_BOOTSTRAP_TOKEN`. Its publish step writes an ephemeral npm user config
containing the literal `${NODE_AUTH_TOKEN}` reference and scopes that config to
the publish command; it never writes the secret value. After that release,
configure the trusted publisher,
revoke the token, and retain only the tokenless `npm` release path.

After a successful publish, a separate clean runner MUST install the exact
version from npm, run `npm audit signatures --json --include-attestations`, and
verify that its Sigstore-verified SLSA provenance binds the expected package,
tag, repository, and workflow. The JSON evidence is retained as a workflow
artifact. A missing or invalid attestation fails the release workflow; it never
updates a visual baseline.

## Dependency maintenance candidates

The native-profile release candidate MUST upgrade the coupled Storybook core,
React/Vite adapter, documentation addon and accessibility addon to 10.6.2.
This repairs GHSA-f2ph-cmg5-wxc8 and GHSA-px85-f4q5-jh77 discovered by the
2026-10-24 pre-release audit. VD-GOV-008 still requires clean full and production
audits and complete package/browser qualification; the repair does not authorize
baseline changes or alter the pinned Playwright capture profile.

Review dependency proposals against the current default branch before a release
source push. Consolidate compatible updates, upgrade tightly coupled Storybook
and Playwright packages together, and record proposals already covered by newer
locked versions. Do not replay stale bot lockfiles over security repairs.

Under VD-GOV-012 and VD-GOV-013, Playwright upgrades require their reviewed
image, native smoke, immutable capture-profile lock and compare-only ARM64
consumer qualification before merging. The approved 1.62.1 image passed both
native smokes in recovery run `39325220413`, preserving the bytes published by
run `39320101643`. The candidate locks its measured Chromium 151.0.7922.34,
Firefox 153.0 and WebKit 26.5 inventory. Pinning this candidate for the required
PR canary does not authorize a baseline update or public npm release.

VD-GOV-008 still requires a clean audit. Dependency consolidation does not apply
the separately proposed audit exception; changing the lock invalidates the old
proposal's candidate digest and requires fresh review.

## Agent workflow

The Wave 1 dependency repair retains the blocking release audit. Patched
development-tool resolutions and scoped Markdown-tool overrides must pass the
same frozen-install, package and hosted browser gates. The separately recorded
two-advisory exception proposal is non-normative, unapproved and inactive; it
cannot authorize an audit suppression or public release. VD-GOV-016 approval
and existing publication/provenance obligations remain unchanged.

For every protected change:

1. Inspect Jujutsu status and preserve unrelated work.
2. Read the relevant canonical pages and requirement IDs.
3. Update the requirement before changing behavior.
4. Update [Verification](./verification.md) with evidence or a declared gap.
5. Implement the smallest conforming change and focused regression coverage.
6. When the change touches portable public runtime source under `src/` or the
   package `package.json`, add a Changeset under `.changeset/` (or an explicit
   empty Changeset when no version bump is required) before opening or updating
   the pull request. Do not bump the published version or edit `CHANGELOG.md`
   by hand; do not publish.
7. Run the specification gate and boundary-appropriate validation.
8. Commit the verified slice with only its specification, implementation,
   evidence, and Changeset when required.

Generated `spec/book/` output is local and disposable. Commit `book.toml`, `SUMMARY.md`, and Markdown source, never rendered HTML.

Related contracts: [System specification](./index.md), [UI catalog host profile](./host-profile.md), and [Verification](./verification.md).

### Approved 0.0.8 development-tool audit exception

On 2026-10-19 the user approved only GHSA-vfj7-8cjw-p6xm in
`braces@3.0.3` and GHSA-hp3w-g68c-fv3c in `sprintf-js@1.0.3` for
0.0.8. This is risk acceptance, not remediation or a clean full audit.
The exception expires at 2026-11-02 00:00 UTC, an available upstream fix,
or publication of 0.0.8, whichever comes first. The LapisMD release operator
owns it. Production audit MUST remain clean.

The reviewed lock SHA-256 is
`7aef952f349b6fcc06b924d521d27cf9a6df1728d3d84c1e317032b99166d189`;
the canonical Linux Node 24.15.0 pnpm tarball SHA-256 is
`3d3c126cf7309e12ac1bc86adbad7ef97ffd67539cceb48f36a18b9068566bd5`.
Its decompressed tar SHA-256 MUST equal the original reviewed payload:
`6f3aa1c5af1bf61448c823e58be3bec866acbdcde4017fa10cad5cba94d65ff1`.
The original local gzip checksum `f445b1d...` differs only in compression;
complete decompressed tar bytes, file metadata and contents are identical.
Only repository-owned release maintenance may be added to qualified source
`9b52f76c723e9e836c27581f5e71a53482862c7a`; packed bytes remain identical.
After protected PR and Version Packages checks pass, the operator MUST pin
`VD_008_AUDIT_APPROVED_SOURCE` to the exact final reviewed source. Both explicit
tag approval and the audit guard MUST reject any other checkout.

The guard MUST retain complete raw audits and reject missing/malformed reports,
registry errors, additional or changed findings, production findings, muted
advisories, available fixes, expired approval, changed identity or an already
published version. The protected publisher MUST re-run the guard immediately
before publication and publish only that checksum-verified pnpm tarball. Normal
source, package, license, browser, protected review, provenance and clean registry
consumer gates remain mandatory. Future releases require a clean audit.

### Verified GitHub release completion

VD-GOV-009 release completion MUST explicitly use `always()` with successful
package and provenance conditions so the deliberately skipped bootstrap branch
cannot suppress the downstream GitHub release. A default-branch manual recovery
MAY create or retain the missing GitHub release for an existing immutable tag.
It MUST require explicit approval, stable version, exact source SHA and original
publication run ID; verify the tag and canonical tag-push workflow/source; and
require successful package, ARM64, correct publisher and Sigstore jobs from that
run. Unknown, incomplete or failed evidence MUST reject. Recovery MUST NOT
create/move tags or invoke npm publication, and MUST preserve an existing public
release for the same tag. Network failures retain unknown-outcome semantics;
a retry MUST read the existing release before any creation.

## Native capture qualification

The verification-only native capture workflow MAY run directly on macOS and
Linux with Node 24.15.0, pnpm 10.32.1 and the exact project Playwright version.
It MUST use disposable fixture baselines and MUST NOT publish an image or
replace committed baseline PNGs. Existing canonical image and release jobs
retain their toolchain and publication requirements.
