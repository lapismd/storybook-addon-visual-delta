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

### Documentation in Storybook

- **Visual Delta → Specification** — live mirror of canonical `spec/src/*.md`
  (edit the Markdown tree; Storybook does not fork the contract). mdBook remains
  the lint/build gate (`pnpm visual-delta:spec:check` / `spec:serve`).
- **Family Guidance** pages (Panel Shell, Panel Chrome, Testing Module, Diff
  Result, Compare Alignment, Readiness Fixture, Host Stubs) explain usage
  context, story maps, and `VD-*` links into the Spec section.
- CSF autodocs descriptions point at those Guidance pages.

Stories are React CSF under `src/stories/**/*.stories.tsx` (plus `*.mdx` docs).
A few Compare Alignment demos remain Svelte and mount through `SvelteHost`.
Minimal host-product stubs under `src/stories/host-stubs/` keep manager/overlay
story IDs stable while the UI catalog no longer hosts Visual Delta CSF.

Preview fonts: `.storybook/preview.ts` and `ThemeHost` apply Storybook theming
`createReset` / Nunito Sans so panel fixtures match manager chrome. Do not rely
on `ThemeProvider` alone — it does not inject the manager’s Global styles.

```bash
pnpm --filter storybook-addon-visual-delta build-storybook
pnpm test:visual-delta-panel          # gated: panel.spec.ts on package Storybook
pnpm test:visual-delta-manager        # manager/overlay/sidebar (stub fidelity WIP)
```

`pnpm checks` runs `test:visual-delta-panel` only. Manager/overlay cases that
historically targeted UI product stories now use package `host-stubs/`; deepen
those stubs before promoting `test:visual-delta-manager` into the aggregate gate.

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
