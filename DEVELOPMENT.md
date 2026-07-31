# Visual Delta development

## Package Storybook (self-test catalog)

Addon demos, panel/manager acceptance stories, and **browseable documentation**
live in this package Storybook:

```bash
# from repo root
pnpm visual-delta:storybook

# or from the package
pnpm --filter storybook-addon-visual-delta storybook
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
  `tests/examples-snapshots/examples/` and mount at `/visual-baselines/examples`.
  Regenerate with `node ./scripts/generate-example-baselines.mjs`.
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
pnpm --filter storybook-addon-visual-delta build-storybook
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
pnpm --filter storybook-addon-visual-delta build-storybook
pnpm test:visual-delta-panel          # gated: panel.spec.ts on package Storybook
pnpm test:visual-delta-manager        # manager/overlay/sidebar (include host stubs)
```

`pnpm checks` runs `test:visual-delta-panel` only.

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
