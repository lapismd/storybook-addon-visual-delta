# Visual Delta agent guide

## Canonical specification

[`spec/src/`](./spec/src/index.md) is the source of truth for Visual Delta architecture, interfaces, behavior, host integration, safety policy, and acceptance criteria.

Before changing behavior, read:

- [System specification](./spec/src/index.md)
- [Specification governance](./spec/src/spec-governance.md)
- [Verification map](./spec/src/verification.md)

The implementation must never be ahead of the specification. Update the relevant stable requirement and its verification evidence before editing behavior, or include both in the same logical slice with the specification edit first.

A code-only behavior change is prohibited even when tests pass. Source, tests, READMEs, generated mdBook output, compatibility pointers, provenance notes, parity notes, and historical plans are evidence or explanation; they cannot redefine the canonical contract.

When code and specification disagree, treat the code as defective unless an explicit specification change is accepted. Do not weaken or bypass a requirement through non-normative documentation.

## Protected system boundary

The contract covers both:

- Portable addon source under this package
- Repository-owned host adapters in `.storybook`, `.visual-delta`, Playwright configuration, Storybook process supervision, and `scripts/ui-generator` visual writers

Keep portable behavior in the package and repository policy in host adapters. Do not duplicate canonical path, capture, readiness, result, or mutation rules across those boundaries.

## Package dependency policy

- Consume published LapisMD packages through normal npm semver ranges.
- Keep publishable manifests portable. Do not vendor dependency source, edit
  dependency `node_modules`, or add checkout-specific paths.
- If a LapisMD dependency needs a source fix, make the change in the owning
  repository, verify it there, and consume a released package version here.

## Workflow

1. Inspect `jj --no-pager st` and preserve unrelated changes.
2. Read the relevant specification page and requirement IDs.
3. Update the specification and verification map before implementation.
4. Add focused regression evidence for the changed boundary.
5. If the change touches portable public runtime source under `src/` or root
   `package.json`, record release intent with a Changeset before the PR:
   - Prefer `pnpm changeset` (interactive), or add `.changeset/<slug>.md`
     manually.
   - Choose `patch` / `minor` / `major` when consumers need a new version.
   - Use an empty Changeset (frontmatter with no package bump) when the public
     files changed but no release is required.
   - Summarize the consumer-visible result; do not edit `package.json` version
     or `CHANGELOG.md` by hand, and do not publish.
   - PR CI enforces this via `pnpm release:intent` (see
     [Package releases](./spec/src/spec-governance.md#package-releases) and
     [DEVELOPMENT.md](./DEVELOPMENT.md#npm-release-administration)).
6. Run `pnpm visual-delta:spec:check` (or `pnpm spec:check` in this package).
7. Run package typecheck and focused unit or browser acceptance as required by [Verification](./spec/src/verification.md).
8. Commit the verified slice with Jujutsu, including the Changeset when required.

Before handoff, run the repository checks appropriate to the change and report unrelated failures separately.

## Baseline safety

Never create, replace, or delete a committed visual baseline unless the user explicitly authorizes that mutation. Compare-only validation must not pass snapshot-update flags or broaden an empty target.

Generated `spec/book/` output is ignored and non-normative. Commit only mdBook configuration, source, and enforcement tooling.

## Cursor Cloud specific instructions

This package is the application: `pnpm storybook` serves the self-test/demo catalog (the Visual Delta panel, manager, and example stories) on port `9109`. Standard scripts live in `package.json` and [`DEVELOPMENT.md`](./DEVELOPMENT.md); the notes below are only the non-obvious cloud caveats.

- Toolchain: the repo pins Node `24.15.0` and pnpm `10.32.1` (see `docker/visual-delta-ci/Dockerfile`). The VM's bundled `/exec-daemon/node` (Node 22) sits early on `PATH`, so `~/.bashrc` prepends the nvm Node 24 bin (and `~/.local/bin`) to win. Run commands in a shell that sources `~/.bashrc` (login shells do); a bare `bash -c` that skips `~/.bashrc` resolves the wrong Node. `pnpm` is provided by corepack for Node 24 only.
- `mdbook` v0.5.4 is installed at `~/.local/bin/mdbook` (prebuilt binary, not Cargo). It is required by `pnpm spec:build` / `pnpm spec:check`; without `~/.local/bin` on `PATH` those fail.
- Everyday checks that run cleanly on this x64 VM: `pnpm build:node`, `pnpm typecheck`, `pnpm test` (vitest), and `pnpm spec:check` (markdownlint + spec gates + mdBook).
- Playwright browser acceptance (`pnpm test:panel`, `pnpm test:manager`, `pnpm test:browsers`) compares committed 3× device-pixel PNG baselines captured on the canonical **Linux ARM64** CI image. On this x64 dev VM font/rasterization differences make those screenshot assertions mismatch by design — that is a platform difference, not a regression. Never regenerate/`--update-snapshots` those baselines (see Baseline safety). Only Chromium is installed by the update flow; run `pnpm exec playwright install firefox webkit` before the browser matrix.
- Docker is not installed here. The authoritative Linux ARM64 capture runner and CI image build need Docker; skip those locally unless it is added.
