# Visual Delta specification governance

This reference defines how the specification leads implementation, which changes require a specification update, and how local and continuous-integration checks enforce that contract.

## Normative requirements

These requirements prevent implementation, tests, and generated documentation from silently redefining Visual Delta.

| ID         | Requirement                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-GOV-001 | Markdown under `spec/src/` MUST be the canonical Visual Delta contract for humans and agents. The generated mdBook, implementation, tests, READMEs, and other non-canonical documentation MUST NOT override it.                                               |
| VD-GOV-002 | Visual Delta implementation MUST never be ahead of the specification. A protected behavior or integration change MUST update the relevant canonical requirement before or in the same logical slice; a code-only behavior change is prohibited.               |
| VD-GOV-003 | An intentional contract change MUST update `verification.md` with focused evidence or a declared gap. Passing tests MUST NOT authorize behavior that the canonical specification does not define.                                                             |
| VD-GOV-004 | The spec-first gate MUST cover portable production code and repository-owned Visual Delta host integration. Tests, fixture stories, ordinary catalog stories, visual baselines, derived artifacts, and generated output MUST NOT trigger or satisfy the gate. |
| VD-GOV-005 | Local enforcement MUST inspect the current Jujutsu change, and pull-request enforcement MUST inspect the exact base-to-head change set. The pull-request workflow MUST fetch complete history and register the checked-out workspace as safe in the root-owned HOME used by its job container before invoking Git. Failure to determine the change set MUST fail closed and report the unresolved scope. |
| VD-GOV-006 | A code-to-spec mismatch MUST be treated as an implementation defect unless an explicit specification change is accepted. Weakening a requirement requires rationale and MUST NOT be disguised by editing non-normative documentation.                         |
| VD-GOV-007 | The package root MUST retain exactly `AGENTS.md`, `DEVELOPMENT.md`, and `README.md` as Markdown files. The obsolete `specs/` tree and package-root historical contract or plan files MUST NOT exist. Links to normative content MUST target `spec/src/`.      |
| VD-GOV-008 | A dependency-audit remediation that changes the Visual Delta package manifest or resolved dependency graph MUST upgrade each reported vulnerable package to a patched release and verify a clean `pnpm audit` result. It MUST NOT create, replace, or delete visual baselines. |
| VD-GOV-009 | A public npm release MUST originate only from an exact stable `vX.Y.Z` tag matching the package version, pass the release validation gates, and wait for protected GitHub Environment approval. Normal publication MUST use npm trusted publishing with GitHub OIDC and provenance, never a registry token. The release MUST install the published package on a clean runner and verify its Sigstore provenance with `npm audit signatures`. Only `v0.0.1` MAY use a one-time bootstrap token, isolated to a separate protected Environment; it MUST still publish provenance and MUST be revoked before the next release. |
| VD-GOV-010 | The canonical panel-baseline capture workflow MUST run only through manual dispatch from the default branch on `ubuntu-24.04-arm`, use the immutable ARM64 capture-profile image, and capture only missing browser-qualified panel references. Its job MAY grant `packages: read` solely to pull the image, plus `contents: write` and `pull-requests: write` solely to commit the exact verified PNGs to a new automation branch and open a review pull request; it MUST NOT write directly to the selected revision. Playwright's expected non-zero result while recording a missing reference MAY continue only to exact-set and compare-only gates; a successful job MUST upload exact PNGs, profile metadata, and checksums as a review artifact before opening the pull request. |
| VD-GOV-011 | Every repository-owned GitHub Actions job that executes package tooling MUST run Node.js `24.15.0` as supplied by the repository CI image. Repository-owned JavaScript actions used by those workflows MUST use a Node.js 24 runtime. |
| VD-GOV-012 | The repository CI image MUST be published to `ghcr.io/lapismd/storybook-addon-visual-delta-ci` only by a manually dispatched default-branch workflow and MUST remain publicly pullable without registry credentials so the built-in consumer runner needs no GHCR setup. A publication MUST build Linux AMD64 and ARM64 from the reviewed Dockerfile, pin Node.js `24.15.0`, npm `12.0.2`, pnpm `10.32.1`, mdBook `0.5.4`, and Playwright Chromium, Firefox, and WebKit `1.61.1`, reject `latest` or an existing image tag as its audit tag, verify anonymous audit-tag inspection, and verify both native architectures. Only after both native smoke jobs pass, it MUST emit a versioned capture-profile manifest containing the multi-platform and ARM64 child digests, the actual browser and tool versions reported by the native ARM64 container, a content-derived manifest hash of that container's fonts, and the canonical locale, time-zone, viewport, scale, and rendering settings. Publication MAY update `latest` for generic tooling, but canonical visual consumers MUST use the immutable ARM64 digest. The workflow MAY grant only `contents: read` and `packages: write` and MUST NOT create or update a baseline. |
| VD-GOV-013 | Repository-owned package-tooling jobs MUST use authenticated CI-image job containers, minimal permissions, Bash, and the root-owned `HOME=/root` required by Firefox, without reinstalling image-supplied toolchains or browsers. A container job that reads checkout VCS history MUST register `$GITHUB_WORKSPACE` as safe under that root-owned HOME after checkout. Specification, package, npm publication, provenance, and image-build jobs MUST remain on stable x64 runners. Panel, manager, browser-matrix, release visual acceptance, and canonical baseline capture MUST run on `ubuntu-24.04-arm` with the immutable ARM64 capture-profile image. The npm release workflow MUST split x64 package gates from ARM64 visual gates and require both before publishing. A checked-out dependency graph still requires `pnpm install --frozen-lockfile`. ARM64 visual jobs MUST be canaried successfully before becoming required. |

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

The complete check also runs the checker test suite. It runs near the start of `pnpm checks`, before implementation typechecking and browser validation.

On a pull request, the required **Visual Delta Spec First / Validate Visual Delta specification** check compares the exact base and head revisions. Its checkout fetches complete history and writes the workspace safe-directory entry after checkout, under the same root-owned HOME used when the checker invokes Git. Repository settings MUST keep that check required before merge. The workflow obtains Node 24.15.0, pnpm 10.32.1, and the prebuilt mdBook 0.5.4 binary from the repository CI image; it does not compile mdBook during a workflow run.

Path-filtered **Visual Delta CI** (`.github/workflows/visual-delta-ci.yml`) runs package typecheck and Vitest, panel browser acceptance, and host catalog visual compare when Visual Delta or catalog paths change. Spec First remains the contract merge gate; repository settings SHOULD enable the Visual Delta CI checks as required once they are stable on the default branch.

The gate reports every protected path when no canonical content page changed. If it cannot obtain or parse a trustworthy change set, it fails closed. Remediation is to update the relevant stable requirement and [verification evidence](./verification.md), not to add a token spec edit or weaken path protection.

Structural validation MUST reject a reintroduced `specs/` tree and any package-root Markdown set other than `AGENTS.md`, `DEVELOPMENT.md`, and `README.md`.

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
produces and verifies a new multi-platform manifest from the default branch.
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
Rebuild the image and update the reviewed capture-profile lock after a merged
dependency, Dockerfile, Node.js, npm, pnpm, mdBook, Playwright, browser, or font
change. Publish the image before enabling jobs that reference its digest because
GitHub resolves a job container before any job step can run.

## Package releases

The portable package is publicly released to `https://registry.npmjs.org`. The
release workflow accepts only pushed `v*` tags; its release guard rejects a tag
that does not exactly equal the stable package version, a private package, an
unexpected package identifier, or incorrect public-registry or repository
metadata. It runs the specification, build, typecheck, unit, dependency-audit,
package dry-run, and compare-only browser gates before publication.

The `npm` GitHub Environment MUST require reviewer approval and be registered
with npm Trusted Publisher for
`lapismd/storybook-addon-visual-delta` and
`.github/workflows/npm-publish.yml`. The `npm-bootstrap` Environment is the
one-time `v0.0.1` exception and is the only environment permitted to expose
`NPM_BOOTSTRAP_TOKEN`. After that release, configure the trusted publisher,
revoke the token, and retain only the tokenless `npm` release path.

After a successful publish, a separate clean runner MUST install the exact
version from npm, run `npm audit signatures --json --include-attestations`, and
verify that its Sigstore-verified SLSA provenance binds the expected package,
tag, repository, and workflow. The JSON evidence is retained as a workflow
artifact. A missing or invalid attestation fails the release workflow; it never
updates a visual baseline.

## Agent workflow

For every protected change:

1. Inspect Jujutsu status and preserve unrelated work.
2. Read the relevant canonical pages and requirement IDs.
3. Update the requirement before changing behavior.
4. Update [Verification](./verification.md) with evidence or a declared gap.
5. Implement the smallest conforming change and focused regression coverage.
6. Run the specification gate and boundary-appropriate validation.
7. Commit the verified slice with only its specification, implementation, and evidence.

Generated `spec/book/` output is local and disposable. Commit `book.toml`, `SUMMARY.md`, and Markdown source, never rendered HTML.

Related contracts: [System specification](./index.md), [UI catalog host profile](./host-profile.md), and [Verification](./verification.md).
