# Visual Delta development

## Package Storybook (self-test catalog)

Addon demos, panel/manager acceptance stories, and **browseable documentation**
live in this package Storybook. The root Deno tasks are canonical.

```bash
deno task storybook
deno task build-storybook
deno task test:panel
deno task test:manager
deno task spec:check
deno task examples:baselines
```

Default port is `9109` (`VISUAL_DELTA_STORYBOOK_PORT`). Panel Playwright uses
`STORYBOOK_PORT + 4` (or `VISUAL_DELTA_PANEL_STORYBOOK_PORT`) and boots this
catalog — not the UI Storybook.

### Documentation and Examples

- **Visual Delta → Specification** — live mirror of canonical `spec/src/*.md`
  (edit the Markdown tree; Storybook does not fork the contract). mdBook remains
  the lint/build gate (`deno task spec:check` / `spec:serve`).
- **Examples/** — realistic demos (match/drift, gallery, interactions, modes,
  layer-flavored subjects). Baselines live under
  `tests/examples-snapshots/examples/` and are served at
  `/visual-baselines/examples`. Vite Storybook reaches them via a symlink from
  the host snapshot tree
  (`../../tests/visual/storybook.spec.ts-snapshots/examples`); nested
  `staticDirs` under `/visual-baselines` are shadowed in development. Prefer
  live captures from a running package Storybook
  (`deno task examples:baselines:capture`, port `VISUAL_DELTA_STORYBOOK_PORT` /
  `9109`) so Diff HTML matches the React subjects. `deno task examples:baselines`
  is the pngjs painter fallback for geometry-only placeholders.
- **Family Guidance** pages (Panel Shell, Panel Chrome, Testing Module, Diff
  Result, Compare Alignment, Readiness Fixture) explain self-test fixtures.
- CSF autodocs descriptions point at those Guidance pages.

Stories are React CSF under `src/stories/**/*.stories.tsx` (plus `*.mdx` docs).
A few Compare Alignment demos remain Svelte and mount through `SvelteHost`.

### Host stubs (test-only)

`src/stories/host-stubs/` keeps manager/overlay story IDs stable. They are
**excluded from the default Storybook UI and static build**. Manager Playwright
sets `VISUAL_DELTA_INCLUDE_HOST_STUBS=1` when launching `storybook:ci`.

### Static read-only deploy

```bash
deno task build-storybook
# serve storybook-static — Visual Delta panel is read-only (VD-UI-008)
```

Static / `PRODUCTION` Storybook keeps overlay, Diff HTML, gallery, and Diff
Result hydrate. Writes, Diff Chromium, runs, Accept, Configuration saves,
Changes, and Testing Module stay off. Force read-only in development with
host option `visualDelta.readOnly: true`.

Preview fonts: `.storybook/preview.ts` and `ThemeHost` apply Storybook theming
`createReset` / Nunito Sans so panel fixtures match manager chrome. Do not rely
on `ThemeProvider` alone — it does not inject the manager’s Global styles.

```bash
deno task test:panel      # gated panel.spec.ts (root: deno task test:panel)
deno task test:manager    # manager/overlay (include host stubs)
deno task spec:check      # lint + validate + mdBook + gates
```

Consumer acceptance invokes these same package-owned tasks after link synchronization.

## CI image administration

Repository workflows use a manually published toolchain image at
`ghcr.io/lapismd/storybook-addon-visual-delta-ci`. The canonical publication
and consumption policies are
[VD-GOV-012 and VD-GOV-013](./spec/src/spec-governance.md#normative-requirements).
Package-tooling jobs pull `:latest` with the repository `GITHUB_TOKEN`, then run
`deno task ci:install` to link the checkout. They do not compile
mdBook or reinstall Node.js, npm, Deno, Playwright browsers, or Linux browser
dependencies during the workflow.

After merging an image, dependency, or pinned-tool change, dispatch **Publish
Visual Delta CI image** from the default branch with a new audit tag. Audit tags
are lowercase Docker tags and cannot be reused; `latest` moves to the same
verified multi-platform manifest. The initial tag is:

```text
node24.15.0-deno2.9.5-playwright1.61.1-r1
```

The normal rebuild triggers are changes to `package.json`, `deno.lock`,
the CI Dockerfile, or the Node.js, npm, Deno, mdBook, or Playwright pins. A
stale image does not override the checked-out lockfile: every consumer still
runs `deno task ci:install`, downloading only missing deltas.

Validate the policy and build the host architecture locally with:

```bash
deno task ci:image:check
docker buildx build --load \
  --file docker/visual-delta-ci/Dockerfile \
  --tag visual-delta-ci:local \
  .
```

Smoke-test every installed browser without mounting the checkout:

```bash
docker run --rm --workdir /build visual-delta-ci:local \
  node --input-type=module -e \
  "import { chromium, firefox, webkit } from 'playwright'; for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) { const browser = await engine.launch({ headless: true }); console.log(name, await browser.version()); await browser.close(); }"
```

## npm release administration

The release contract is canonical in
[Specification governance](./spec/src/spec-governance.md#package-releases).
The repository and npm package must be public before the first release.

### Authoring a release change

1. Make the public package change and update the canonical specification.
2. Run `deno task changeset`. Choose a bump when consumers need a new version, or an
   empty Changeset when the change does not require a release.
3. Run `deno task spec:check` and the affected package gates.
4. Merge the reviewed pull request. `.github/workflows/release.yml` creates or
   updates the Version Packages pull request.
5. Review and merge Version Packages. The same workflow creates the exact
   `vX.Y.Z` tag matching `package.json` when that tag is absent (only on the
   Version Packages commit).
6. `.github/workflows/npm-publish.yml` runs on that tag. Approve the `npm` or
   `npm-bootstrap` Environment as required.

Do not edit the published version or changelog by hand, publish from a
workstation, or call `changeset publish`.

### Repository secrets for tagging

GitHub's default `GITHUB_TOKEN` cannot start other workflows. Store a fine-grained
personal access token (or GitHub App installation token) as repository secret
`RELEASE_TAG_TOKEN` with Contents read/write on this repository. The versioning
workflow uses it only to push exact `vX.Y.Z` tags so
`.github/workflows/npm-publish.yml` can run.

### One-time `v0.0.1` bootstrap

Before the first tag:

1. Protect `v*` tags and create reviewer-gated GitHub Environments named
   `npm-bootstrap` and `npm`.
2. Configure `RELEASE_TAG_TOKEN` as above.
3. Store the one-time npm automation token only as
   `NPM_BOOTSTRAP_TOKEN` in `npm-bootstrap`; never add it as a repository
   secret or to `npm`.
4. Merge the release workflows, then merge a Version Packages pull request that
   leaves `package.json` at `0.0.1` (or otherwise ensure CI creates `v0.0.1`)
   and approve the bootstrap Environment.

After that release succeeds, register the normal tokenless npm Trusted
Publisher and confirm it before deleting and revoking the bootstrap token:

```bash
npm trust github @lapismd/storybook-addon-visual-delta \
  --file npm-publish.yml \
  --repo lapismd/storybook-addon-visual-delta \
  --env npm \
  --allow-publish -y
npm trust list
```

The next exact stable tag, `v0.0.2`, exercises the OIDC-only release path. Do
not publish from a workstation or recreate the bootstrap token.

## UI catalog host

The `/Users/stevejuma/ui` Storybook still loads the addon via
`.storybook/visual-delta-preset.ts` for **product** visual compare (Shadcn,
Forms, Shell, …). It does not host Visual Delta self-test stories.

## Manager / preview reloads

The Storybook preview iframe is served by Vite, so preview and overlay source
changes use Vite HMR. Storybook's manager is different: its local addon entries
are compiled into a one-shot esbuild bundle.

The host Storybook wrapper watches Visual Delta manager and panel
sources and restarts the **UI** Storybook to rebuild that bundle. The package
Storybook uses the same local-source preset pattern
(`.storybook/local-preset.ts`).

In development, the manager polls `GET /__visual-delta/runtime` once per second.
That endpoint returns an identity which is stable for one middleware instance
and changes after a restart. When the identity changes, the manager reloads the
page once so the rebuilt bundle is loaded while retaining URL-backed story,
panel, and filter state.

Transient request failures during a restart are ignored. A host without the
runtime endpoint (404), or one returning a malformed success response, disables
the watcher for that browser session. Static and production builds do not
install the watcher.
