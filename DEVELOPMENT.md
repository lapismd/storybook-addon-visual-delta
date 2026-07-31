# Visual Delta development

## Package Storybook (self-test catalog)

Addon demos, panel/manager acceptance stories, and **browseable documentation**
live in this package Storybook. Prefer package scripts (standalone-ready); root
`pnpm visual-delta:*` aliases delegate here.

```bash
# from this package
pnpm storybook
pnpm build-storybook
pnpm test:panel
pnpm test:manager
pnpm spec:check
pnpm examples:baselines

# from the monorepo root (same commands via filter)
pnpm visual-delta:storybook
pnpm visual-delta:build-storybook
pnpm test:visual-delta-panel
pnpm visual-delta:spec:check
```

Default port is `9109` (`VISUAL_DELTA_STORYBOOK_PORT`). Panel Playwright uses
`STORYBOOK_PORT + 4` (or `VISUAL_DELTA_PANEL_STORYBOOK_PORT`) and boots this
catalog — not the UI Storybook.

### Documentation and Examples

- **Visual Delta → Specification** — live mirror of canonical `spec/src/*.md`
  (edit the Markdown tree; Storybook does not fork the contract). mdBook remains
  the lint/build gate (`pnpm visual-delta:spec:check` / `spec:serve`).
- **Examples/** — realistic demos (match/drift, gallery, interactions, modes,
  layer-flavored subjects). Baselines live under
  `tests/examples-snapshots/examples/` and are served at
  `/visual-baselines/examples`. Vite Storybook reaches them via a symlink from
  the host snapshot tree
  (`../../tests/visual/storybook.spec.ts-snapshots/examples`); nested
  `staticDirs` under `/visual-baselines` are shadowed in development. Prefer
  live captures from a running package Storybook
  (`pnpm examples:baselines:capture`, port `VISUAL_DELTA_STORYBOOK_PORT` /
  `9109`) so Diff HTML matches the React subjects. `pnpm examples:baselines`
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
pnpm build-storybook
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
pnpm test:panel      # gated panel.spec.ts (root: pnpm test:visual-delta-panel)
pnpm test:manager    # manager/overlay (include host stubs)
pnpm spec:check      # lint + validate + mdBook + gates
```

Monorepo `pnpm checks` runs the panel suite via the root alias.

## npm release administration

The release contract is canonical in
[Specification governance](./spec/src/spec-governance.md#package-releases).
The repository and npm package must be public before the first release.

Before tagging `v0.0.1`:

1. Protect `v*` tags and create reviewer-gated GitHub Environments named
   `npm-bootstrap` and `npm`.
2. Store the one-time npm automation token only as
   `NPM_BOOTSTRAP_TOKEN` in `npm-bootstrap`; never add it as a repository
   secret or to `npm`.
3. Merge `.github/workflows/npm-publish.yml`, then push the exact `v0.0.1` tag
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

The workspace `pnpm storybook` wrapper watches Visual Delta manager and panel
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
