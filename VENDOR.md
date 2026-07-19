# Vendored: storybook-addon-visual-delta

Local copy of **`storybook-addon-visual-delta@0.1.5`** from the npm tarball
(`npm pack storybook-addon-visual-delta@0.1.5`).

| | |
| --- | --- |
| Upstream npm | `storybook-addon-visual-delta@0.1.5` |
| License | MIT (see `LICENSE`) |
| Original author | houjinlong |
| npm `repository` field | `https://github.com/HouJinlong/storybook-addon-visual-delta` (404 / unavailable) |

The published package only includes **prebuilt `dist/`** (no TypeScript `src/`).
This workspace package is that runtime implementation so we can maintain overlays
against Playwright baselines without relying on the missing GitHub repo.

Edit the JS under `dist/` (or replace with a future rebuild) when adapting behavior.

## Local patches (on top of 0.1.5)

- **Viewport align** — Default `align: "viewport"` pins overlays to the iframe
  origin (Playwright fullPage). Use `align: "canvas"` for the old
  `#storybook-root` offset.
- **Auto-select** — First baseline image is selected on `INIT_IMAGE`.
- **Difference blend** — UI label for `mix-blend-mode: difference` (was
  “Color inversion”).
- **Pass threshold** — Configurable `%` (default `0.1`); was hardcoded `< 2`
  with a mismatched comment.
- **Diff fit** — Pad/crop actual → baseline size instead of stretching.
- **Quiet preset** — Removed Vite/Webpack “enhancing config” console logs.
- **Run Diff capture** — Replaced Chrome-extension screenshot bridge
  (`HIYA_EXTENSION_*`, which never responds here) with same-origin
  preview iframe capture via `html-to-image`.
