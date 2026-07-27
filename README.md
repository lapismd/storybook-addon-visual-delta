# storybook-addon-visual-delta

Storybook addon for comparing stories to committed baseline PNGs: placement pad,
overlay / heatmap Live Diff, Create / Update baselines, Run visual tests, and
review tags. In development, each concrete baseline also has read-only VCS
history with revision-to-revision comparison.

See [`VENDOR.md`](./VENDOR.md) for implementation history and behavior notes.
Storybook loads TypeScript/`tsx` from `src/` (no committed manager/preview
`dist/`). The Node CLI builds to `dist/node/` (`visual-delta` bin).

## Quick start (portable host)

### Option A — Storybook add + init (recommended)

```bash
# From a Vite Storybook project that already has react
npx storybook add storybook-addon-visual-delta
pnpm add -D playwright
pnpm exec playwright install chromium
pnpm exec visual-delta init
```

`storybook add` registers the addon in `.storybook/main.ts`. `visual-delta init`
writes the thin suite, Playwright config, snapshot dir, and package scripts.
Peers: `storybook`, `react`, `vite` (for `viteFinal`), and `playwright` for the
suite / Diff Chromium / CLI.

Then open Storybook → **Visual Delta** → **Create visual** on a story.

If the panel empty state says the suite is missing, click **Set up Visual Delta**
(same as `visual-delta init` via `/__visual-delta/init`).

### Option B — Manual three files

```bash
pnpm add -D storybook-addon-visual-delta playwright react
pnpm exec playwright install chromium
```

```ts
// .storybook/main.ts
addons: ["storybook-addon-visual-delta"],
```

```ts
// tests/visual/storybook.spec.ts
import { defineVisualSuite } from "storybook-addon-visual-delta/playwright";
defineVisualSuite();
```

```ts
// playwright.config.ts
import { defineVisualPlaywrightConfig } from "storybook-addon-visual-delta/playwright";
export default defineVisualPlaywrightConfig();
```

```json
{
  "scripts": {
    "build-storybook": "node -e \"require('node:fs').mkdirSync('.cache/visual-delta',{recursive:true})\" && storybook build --stats-json .cache/visual-delta",
    "test:visual": "visual-delta test --all",
    "test:visual:affected": "visual-delta test --affected",
    "visual-delta": "visual-delta"
  }
}
```

What bare package registration + the preset wire for you:

| Hook / export                     | Effect                                                                   |
| --------------------------------- | ------------------------------------------------------------------------ |
| Package `./manager` + `./preview` | Panel, Testing Module, overlay (Storybook 10 auto-loads these)           |
| Preset `staticDirs`               | Serves `tests/visual/storybook.spec.ts-snapshots` at `/visual-baselines` |
| Preset `viteFinal`                | `/__visual-delta/*` middleware + CSF baseline inject                     |

The packaged preset does **not** re-append `managerEntries` /
`previewAnnotations` — Storybook already resolves `storybook-addon-visual-delta/manager`
and `…/preview` when the package is listed in `addons`.

Defaults (override via `options.visualDelta`):

| Concern             | Default                                           |
| ------------------- | ------------------------------------------------- |
| Snapshot directory  | `tests/visual/storybook.spec.ts-snapshots`        |
| Path mode           | `story-id` (flat `{storyId}-chromium-darwin.png`) |
| Create / update CLI | `pnpm exec visual-delta update …`                 |
| Interaction CLI     | `pnpm exec visual-delta interaction-update …`     |
| Compare run         | `pnpm exec playwright test`                       |

Baseline URLs look like `/visual-baselines/<story-id>-chromium-darwin.png`.

## Requirements

| Peer         | Notes                                                                     |
| ------------ | ------------------------------------------------------------------------- |
| `storybook`  | Manager + preview annotations                                             |
| `react`      | Manager / panel UI                                                        |
| `vite`       | Needed for `viteFinal` (middleware + CSF inject) on Vite Storybook hosts  |
| `playwright` | Optional peer — required for Diff Chromium, suite, and `visual-delta` CLI |

You still commit PNGs under the snapshot dir and keep a thin Playwright entry
(or a custom suite). Tag-badge chrome for review tags is optional host polish.

## Install

```bash
pnpm add -D storybook-addon-visual-delta
```

### Package exports

| Import                                        | Purpose                                                         |
| --------------------------------------------- | --------------------------------------------------------------- |
| `storybook-addon-visual-delta`                | Package root                                                    |
| `storybook-addon-visual-delta/preset`         | `staticDirs`, `viteFinal` (manager/preview via package exports) |
| `storybook-addon-visual-delta/preview`        | Overlay + `runStep` / park                                      |
| `storybook-addon-visual-delta/manager`        | Panel + Testing Module + review-layout tool                     |
| `storybook-addon-visual-delta/playwright`     | `defineVisualSuite` + Playwright config helpers                 |
| `storybook-addon-visual-delta/node`           | Middleware, inject plugins, CLI runners (Node)                  |
| `storybook-addon-visual-delta/visual-capture` | Mid-play capture helper                                         |

Bin: `visual-delta` → `init` / `test` / `update` /
`interaction-update`.

## Storybook configuration

### Register the addon

Bare registration (recommended for new projects):

```ts
// .storybook/main.ts
addons: ["storybook-addon-visual-delta"],
```

With options:

```ts
addons: [
  {
    name: "storybook-addon-visual-delta",
    options: {
      visualDelta: {
        // optional — see Options
        snapshotDir: "tests/visual/storybook.spec.ts-snapshots",
        baselinePathMode: "story-id",
        affectedTests: {
          // optional: files that Storybook does not import but can change rendering
          externals: ["public/**"],
        },
      },
    },
  },
],
```

`staticDirs` for `/visual-baselines` is registered by the preset. You only need
a host `staticDirs` entry if you map a different snapshot path yourself (the
preset skips when `/visual-baselines` is already mapped).

### Preview

No host preview changes are required for Visual Delta. The addon’s `preview`
annotation installs the overlay channel, `RUN_UNTIL_STEP` / `runStep`, and
decorators. Keep theme / a11y / globals in your own `.storybook/preview.ts`.

### What `viteFinal` registers

1. **Baseline CSF inject** — adds `parameters.visualDelta` when matching PNGs exist under `snapshotDir`
2. **Dev middleware** — `/__visual-delta/*` (create / update / interaction / run / cancel / review)
3. **Source watch** — when `addonSrcDir` is set (preview HMR while editing the addon)

Skipped when `process.env.VITEST` is set (Storybook Vitest browser runs).

### Middleware routes

| Method | Path                                          | Action                                                    |
| ------ | --------------------------------------------- | --------------------------------------------------------- |
| `POST` | `/__visual-delta/create-baseline`             | Create missing baselines + CSF wiring                     |
| `POST` | `/__visual-delta/update-baseline`             | Overwrite baselines                                       |
| `POST` | `/__visual-delta/delete-baseline`             | Remove one exact CSF/local screenshot + sidecars          |
| `POST` | `/__visual-delta/create-interaction-baseline` | Mid-play step capture                                     |
| `POST` | `/__visual-delta/capture-subject`             | Diff Chromium subject PNG (NDJSON progress)               |
| `POST` | `/__visual-delta/run-tests`                   | Compare-only Playwright run (NDJSON stream)               |
| `GET`  | `/__visual-delta/affected-plan`               | Read the current affected-story selection and reason      |
| `POST` | `/__visual-delta/action-scope`                | Stream preflight progress, then freeze Testing Module IDs |
| `GET`  | `/__visual-delta/run-events`                  | Replay / continue an in-flight or recent run              |
| `GET`  | `/__visual-delta/run-status`                  | Lightweight phase/progress for active/last run            |
| `POST` | `/__visual-delta/cancel-tests`                | Abort an in-flight run                                    |
| `POST` | `/__visual-delta/review-status`               | Set CSF review tags (`storyId`+`status` or `updates[]`)   |
| `POST` | `/__visual-delta/skip-visual`                 | Add or remove `skip-visual` on a story                    |
| `GET`  | `/__visual-delta/baseline-history`            | Paginated JJ/Git history for one baseline PNG             |
| `GET`  | `/__visual-delta/baseline-history/image`      | Validated PNG bytes from one reachable revision           |
| `GET`  | `/__visual-delta/baseline-history/diff`       | Component-folder source diff between two revisions        |

Create / update spawn `pnpm <visualUpdateArgs…>` with appended flags:

- `--create-only` on create
- `--component <name>` or repeated exact `--story-id <id>` values

Interaction writes spawn `pnpm <visualInteractionUpdateArgs…>` with:

- `--create-only` unless overwrite
- `--story-id`, `--step-label`, and optional `--step-id`

Run-tests uses `pnpm <visualTestArgs…>` (optional escaped, end-anchored `-g`
grep from exact story IDs)
and may call `pnpm build-storybook` first when `allowRebuild` is enabled and
`storybook-static` is incomplete/stale (missing `index.json` or `iframe.html`,
or the client requests a rebuild). Progress is streamed with a **list-only**
Playwright reporter so the Testing Module can show live `Testing N/M` counts.
The global Testing Module resolves its visible story IDs before the first
enabled action. An affected preflight first reads the cached graph, returns
immediately when every fingerprint is current, or rebuilds static Storybook
and recomputes the plan before freezing `visible ∩ affected`. The action-scope
response is NDJSON: it reports resolving, rebuilding (with a one-second elapsed
heartbeat), and freezing phases before the final exact-ID result. The Testing
Module therefore does not present the comparison row as running until
`/run-tests` actually begins. Responses and run events include the selection,
selected and unchanged counts, no-change status, and any conservative fallback
reason.
After HMR remounts the Testing Module (e.g. Update status), the client
reconnects via `/run-status` + `/run-events` instead of losing progress.

### Baseline actions and history

In Storybook development, each baseline accordion ends with a kebab containing
**History**, **Update baseline**, and **Delete screenshot** for that concrete
Default, named mode, or interaction PNG. Delete validates that the path belongs
to the open story, removes its exact CSF image/interaction and review tag, then
deletes the local PNG plus derived sidecar/diff artifacts. Sibling stories and
screenshots are not selected.

The history view is scoped to the concrete PNG currently selected. Choose any
**Before** and **After** revisions to use the same 2-up, Diff, Focus, Swipe,
Blink, zoom, and lightbox tools as the live comparison.

The revision timeline and image comparison remain equal-height panes. Beneath
them, **Component diff** shows an aligned source diff for files in the current
story/component folder, excluding binary baseline files. Existing PNG history
does not contain historical DOM snapshots, so this is the VCS-backed source
equivalent rather than reconstructed DOM.

Visual Delta prefers Jujutsu when `jj root` succeeds, including colocated
JJ/Git checkouts, and otherwise falls back to Git. JJ shows the stable change
ID with its commit ID secondarily and reads committed data with
`--ignore-working-copy`; Git shows commit SHAs and follows renames. A changed
PNG in the filesystem appears as **Working copy**. History is read-only and
does not change baselines or visual review status.

## Options (`VisualDeltaHostOptions`)

Pass under addon `options.visualDelta`. Types from
`storybook-addon-visual-delta/preset` or `…/node`.

| Option                        | Default                                    | Purpose                                                                |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `showToolbarStatusLabels`     | `true`                                     | Show the current story's named visual-review status in the toolbar     |
| `root`                        | Vite `config.root` / `process.cwd()`       | Spawn cwd and path resolution                                          |
| `snapshotDir`                 | `tests/visual/storybook.spec.ts-snapshots` | Absolute or root-relative PNG directory                                |
| `baselinePathMode`            | `story-id`                                 | Flat story-id PNGs, or `nested-import` for folder layouts              |
| `addonSrcDir`                 | Addon `src/`                               | Vite watch root for addon preview HMR                                  |
| `visualUpdateArgs`            | `exec visual-delta update …`               | Argv after `pnpm` for primary baseline writes                          |
| `visualInteractionUpdateArgs` | `exec visual-delta interaction-update …`   | Argv after `pnpm` for mid-play captures                                |
| `visualTestArgs`              | `exec playwright test`                     | Argv after `pnpm` for compare-only runs                                |
| `visualServerPort`            | Storybook port + 1                         | Static Storybook port (`STORYBOOK_PORT+1` / `VISUAL_SERVER_PORT`)      |
| `allowRebuild`                | `true` (unless set `false`)                | Allow `build-storybook` before run-tests                               |
| `affectedTests`               | `false`                                    | Enable affected selection; accepts `cacheDir`, `externals`, `untraced` |

The middleware, story-index reader, sidecar resolver, source patchers, and
Playwright-server readiness checks are package-owned. A packed or file-linked
consumer does not need the UI repository's `scripts/` tree.

The source patcher supports both Svelte CSF (`.stories.svelte`) and object-style
TypeScript/JavaScript CSF (`.stories.ts`, `.tsx`, `.js`, `.jsx`). Review and
skip actions preserve the rest of the exported story object.

## Affected visual tests

Affected mode compares the current project to the last locally passing visual
run. It uses `preview-stats.json` plus `storybook-static/index.json` to build
each story's transitive dependency closure, fingerprints the closure and owned
baseline PNGs, and stores passing fingerprints under
`.cache/visual-delta/affected-state-v1.json`.

```bash
# Always capture the complete suite and seed the local cache.
pnpm exec visual-delta test --all

# No-op, capture only affected stories, or conservatively fall back to all.
pnpm exec visual-delta test --affected

# Inspect the decision without rebuilding or launching Playwright.
pnpm exec visual-delta test --affected --dry-run --explain
```

Static builds must emit Storybook's Vite stats:

```json
{
  "scripts": {
    "build-storybook": "node -e \"require('node:fs').mkdirSync('.cache/visual-delta',{recursive:true})\" && storybook build --stats-json .cache/visual-delta"
  }
}
```

The cache is disposable and machine-local. Missing or invalid cache/graph data,
unsupported builders, unresolved new stories, Storybook configuration or
preview dependencies, capture infrastructure, Playwright configuration,
package metadata, lockfiles, configured static assets, and `externals` all
select the full suite. A changed baseline PNG selects its owning story.
`skip-visual` stories are always excluded. Only stories Playwright successfully
exercises receive updated fingerprints, so failures and timeouts remain
affected.

`externals` are root-relative globs for rendering inputs outside Storybook's
module graph and deliberately force a full run when changed. `untraced` globs
are optional root-relative globs for known non-rendering files:

```ts
affectedTests: {
  cacheDir: ".cache/visual-delta",
  externals: ["public/**"],
  untraced: ["docs/**"],
}
```

`untraced` is disabled by default because every configured glob reduces visual
coverage. Prefer leaving a file traced unless it is demonstrably unrelated to
rendering.

The Visual Delta panel retains Story, Component, and All scopes and adds
Affected. The global Testing Module defaults to Affected when the feature is
enabled and shows either **Up to date** or
**N affected · M unchanged** before and during a run.

An image entry can override the capture metadata used by overlay sizing and
live diff:

```ts
parameters: {
  visualDelta: {
    images: [
      "/visual-baselines/current-chromium-darwin.png",
      {
        src: "/lapis-reference/workspace-shell-light.png",
        deviceScaleFactor: 1,
        viewport: { width: 1440, height: 960 },
      },
    ],
  },
}
```

### Default CLI argv

Portable defaults use the packaged bin:

```ts
visualUpdateArgs: [
  "exec",
  "visual-delta",
  "update",
  "--allow-dirty",
  "--approved",
  "--skip-build",
];

visualInteractionUpdateArgs: [
  "exec",
  "visual-delta",
  "interaction-update",
  "--allow-dirty",
  "--approved",
  "--skip-build",
];
```

Playwright captures `storybook-static`, not live Storybook. Hosts default to
`--skip-build` for speed. Use the panel kebab **Rebuild storybook static** or
pass `--rebuild` for an explicit force rebuild. Affected-plan refreshes and
missing/incomplete static output still rebuild automatically for correctness.
Override these argv lists to point at host scripts when needed (see Advanced
host below). The middleware appends `--create-only`, `--component` or repeated
exact `--story-id` values, `--step-label`, `--step-id`, and sets
`VISUAL_UPDATE_APPROVED=1` in the child environment.

## Story CSF

```ts
parameters: {
  visualDelta: {
    images: [
      {
        src: "/visual-baselines/shadcn/button/default-chromium-darwin.png",
        align: "canvas", // pin to story subject; or "viewport"
        placement: "center",
      },
    ],
    /** Chromatic-style modes (globals + optional per-mode baseline `src`). */
    modes: {
      dark: {
        globals: { colorMode: "dark" },
        src: "/visual-baselines/…/default--dark-chromium-darwin.png",
      },
    },
    /** pixelmatch color threshold 0–1 (Live Diff). */
    diffThreshold: 0.2,
    diffIncludeAntiAliasing: false,
    /** Extra settle ms before capture (Live Diff + Playwright). */
    delay: 0,
    /** Fine-tune the absolute Baseline chip inside its 6px top-start anchor. */
    baselineLabelOffset: { x: 0, y: 0 },
    /** Hide these CSS regions during capture (plus data-visual-delta-ignore). */
    ignoreSelectors: [".toast"],
    cropToViewport: false,
    passThresholdPercent: 0.1,
    interactions: [
      {
        stepId: "opens-chooser",
        label: "Opens chooser",
        src: "/visual-baselines/…/default--opens-chooser-chromium-darwin.png",
      },
    ],
  },
},
```

Ignore markers in the DOM (highlighted via toolbar **Highlight ignored**):
`data-visual-delta-ignore`, `data-chromatic="ignore"`, `.chromatic-ignore`.

Panel **More → Configuration** opens a scrolling, tabbed settings surface.
**Defaults** edits the allow-listed project defaults in
`.visual-delta/config.json`: pass and pixel thresholds, anti-aliasing,
capture delay/cropping, placement/opacity, Baseline-label offsets, and the
opening zoom for preview splits and Diff results. **Resolved** keeps the
read-only host paths, commands, diagnostics, setting sources, and raw JSON.
Preview splits open with Fit by default; Diff results open at native 100% so
component-clipped captures remain readable, with Fit still available as an
explicit project setting or toolbar action.
Stories/components may override capture and overlay values through
`parameters.visualDelta`; resolution order is story/component parameters →
project defaults → built-ins.

`GET /__visual-delta/config` returns both editable defaults and resolved host
configuration. Validated `PUT` updates are written atomically, broadcast to the
manager and preview, and invalidate the next static build. The legacy
`.visual-delta/playwright.json` threshold remains a fallback when no project
config exists.

Testing Module **Run tests** (global runner and sidebar story/component
context menu) freezes one scope and runs checked actions in order:
create/update baselines (**Create missing** mode default; baselines row off by
default), compare (on by default), then **Update status** (off by default;
pass → `visual-ready`, fail → `visual-failed`). A story context is exactly that
story, a component context is every descendant story, and the global runner is
the leaf stories currently visible in the filtered sidebar. **Affected only**
uses the intersection of those visible IDs and the refreshed affected plan.
Empty scopes report **No visible stories** or **Up to date** and never broaden.

Chromatic gap matrix: [`PARITY.md`](./PARITY.md).

### Review tags (Accept vs Ready / Failed)

Review tags are mutually exclusive CSF tags on the story. Visual Delta owns the
sidebar labels for `skip-visual`, failed, ready, pending, and approved, while
Storybook's native status store continues to show transient run results. Set
review tags from the panel or by editing `tags={…}` / posting
`POST /__visual-delta/review-status` (single `{ storyId, status }` or batched
`{ updates: [{ storyId, status }] }`). Patchers keep **exactly one** review tag:
setting `ready` clears `failed` / `pending` / `approved` even when the desired
tag was already present alongside a sibling. Skipping visual clears all review
tags. **Update status** / middleware refuse `visual-failed` when no committed
baseline PNG exists for the story (missing-baseline Playwright failures are
skipped, not stamped failed).

| Tag               | Meaning                                                | How it is set                                   |
| ----------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `visual-pending`  | Baseline exists; awaiting review after unaccept        | **Unaccept**                                    |
| `visual-ready`    | Agent/dev finished visual work; ready for human review | Create / rewrite baselines; panel **Ready** pad |
| `visual-approved` | Human accepted the baseline                            | **Accept** (story or component scope)           |
| `visual-failed`   | Review rejected / known bad                            | Panel **Failed** pad                            |

**Panel controls**

- **Accept / Unaccept** — human sign-off. Accept → `visual-approved`; Unaccept →
  `visual-pending`. Scope menu: story, entire component, or current run. These
  actions and the Ready / Failed pad do not read Testing Module preferences.
- **Ready / Failed** pad — agent/dev signals only (pending/approved are _not_
  on this pad; use Accept/Unaccept for those).

**Agent guidance:** Create / Update baselines stamp `visual-ready` (and clear
`visual-pending` / approved / failed) so humans can scan the sidebar for
`⚑ Ready`. Do **not** set `visual-approved` from agent work — leave Accept to
a human. **Unaccept** returns a story to `visual-pending`.

### `skip-visual` from the panel

When a story has **no baseline**, the header shows **Skip visual tests** next
to Create visual. When the story is already skipped, the header shows
**Include in visual tests**. Stories that already have baselines keep skip /
include under **More** as well. Both paths patch CSF via
`POST /__visual-delta/skip-visual`:

| Action                      | Effect                                      |
| --------------------------- | ------------------------------------------- |
| **Skip visual tests**       | Adds `skip-visual` (and clears review tags) |
| **Include in visual tests** | Removes `skip-visual`                       |

Skipped stories are excluded from Playwright visual runs and from Visual Delta
Testing Module scope. Review status and Update baselines stay disabled while
skipped. Prefer this over hand-editing tags when flake cannot be stabilized
(document why in the story if the skip is permanent). CLI:
`pnpm ui visual:tag skip|include` or `visual-delta skip|include`.

### Review layout (canvas + panel)

Toggle **Review layout** from the preview toolbar, the panel header control, or
the panel **More** menu to:

1. Hide the sidebar
2. Dock the addon panel **bottom**, full width
3. Select the Visual Delta panel
4. Size the bottom panel to ~42% of the viewport height

The preview toolbar stays visible so the toolbar control remains a reliable
exit affordance (hiding it remounts Storybook landmark regions and can crash
the manager). Exit restores the prior sidebar, panel position, and sizes;
Visual Delta stays selected.

### Diff capture engines

Diff is its own split button (separate from Story / Component / All runs):

| Mode              | Capture                                                   | Use when                                 |
| ----------------- | --------------------------------------------------------- | ---------------------------------------- |
| **Diff HTML**     | `html-to-image` in the live preview iframe                | Fast iteration                           |
| **Diff Chromium** | Playwright Chromium via `/__visual-delta/capture-subject` | Matching committed baselines (fonts, AA) |

**Diff Chromium** streams NDJSON progress (`launching` → `navigating` →
`settling` → `capturing` → `encoding`) into the Diff Stop control. Stop aborts
the fetch mid-capture.

`html-to-image` rasterizes through SVG `foreignObject`, so variable fonts
(e.g. DM Sans Variable) can paint at different glyph widths than Playwright’s
native screenshots. Prefer **Diff Chromium** when diagnosing baseline parity.
Requires `playwright` installed in the host (optional peer of this package).

Before Diff HTML rasterizes, Visual Delta hides its overlay and establishes the
selected image’s CSS `viewport` (default 1280×900) in the preview iframe. The
transaction verifies the iframe layout is stable for two frames, the current
story has finished, preparation chrome is gone, fonts are ready, and the
explicit story delay has elapsed exactly once. It fails instead of silently
padding a viewport mismatch, then restores iframe geometry, scroll, and focus
before revealing the overlay. Capture diagnostics record requested/observed
viewport, device scale, and bitmap dimensions in the Diff result.

Storybook’s built-in fullscreen (F) control is unchanged (canvas-only).

## Addon vs host

| This package                                      | Your project                                     |
| ------------------------------------------------- | ------------------------------------------------ |
| Panel, Testing Module, overlay, Live Diff         | Committed PNGs under the snapshot dir            |
| Preset `staticDirs` → `/visual-baselines`         | Thin Playwright entry (`defineVisualSuite`)      |
| `viteFinal` middleware + CSF inject               | Project capture/compare defaults                 |
| Packaged `visual-delta` CLI (create / update / …) | Custom suites (reference captures, extra masks)  |
| `storybook-addon-visual-delta/playwright` helpers | Approval policy is `--approved` / env (built-in) |

---

## Advanced host: `@stevejuma/ui` catalog

The UI catalog uses the packaged Playwright config helper and preset
`staticDirs`, but keeps catalog-specific overrides:

- `baselinePathMode: "nested-import"`
- create/update via `scripts/ui-generator/cli.ts` (host approval gates and recipes)
- custom `tests/visual/storybook.spec.ts` (not `defineVisualSuite`)

```ts
// playwright.config.ts
import { defineVisualPlaywrightConfig } from "storybook-addon-visual-delta/playwright";
export default defineVisualPlaywrightConfig();
// Optional: defineVisualPlaywrightConfig({ port: 9010 }) to pin the static port.
```

### `package.json` scripts

```json
{
  "scripts": {
    "storybook": "storybook dev -p 9009",
    "build-storybook": "node -e \"require('node:fs').mkdirSync('.cache/visual-delta',{recursive:true})\" && storybook build --stats-json .cache/visual-delta",
    "test:visual": "visual-delta test --all",
    "test:visual:affected": "visual-delta test --affected",
    "test:visual:update": "tsx scripts/ui-generator/cli.ts visual-update",
    "visual-delta": "node packages/storybook-addon-visual-delta/dist/node/cli.js"
  }
}
```

### CLI entrypoints

| Command                                                        | Role                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `tsx scripts/ui-generator/cli.ts visual-update`                | Create missing or overwrite primary baselines; patches CSF `parameters.visualDelta`   |
| `tsx scripts/ui-generator/cli.ts visual-interaction-update`    | Mid-play step PNG + CSF `interactions` entry                                          |
| `pnpm ui visual:tag …`                                         | Bulk `skip-visual` / mutually exclusive review tags (component, story, or prefix)     |
| `pnpm exec visual-delta skip` / `include`                      | Packaged-CLI skip-visual add/remove (`--story-id` / `--component`)                    |
| `pnpm test:visual-delta-panel`                                 | Real panel, overlay placements, and static/dev manager sidebar compare (never writes) |
| `VISUAL_UPDATE_APPROVED=1 pnpm test:visual-delta-panel:update` | Gated update for the isolated panel self-test baseline directory                      |
| `pnpm test:visual`                                             | Full compare and affected-cache seed; never writes baselines                          |
| `pnpm test:visual:affected`                                    | No-op, affected-only compare, or conservative full fallback                           |
| `pnpm visual-delta test --affected --dry-run --explain`        | Explain the selection without rebuilding or capturing                                 |

Useful flags on those CLIs: `--approved`, `--allow-dirty`, `--create-only`,
`--skip-build`, `--rebuild`, `--component <name>`, `--story-id <id>`,
`--step-label`, `--step-id`. For `visual:tag`: `--status`, `--prefix`.

Skip / include examples (requires `storybook-static/index.json`):

```bash
pnpm ui visual:tag skip --story-id shadcn-button--default
pnpm ui visual:tag include --component button
pnpm exec visual-delta skip --story-id shadcn-button--default
pnpm exec visual-delta include --component button
pnpm ui visual:tag review --status ready --component button
pnpm ui visual:tag --help
```

Prefer the panel for one-off edits; use `visual:tag` for bulk/scripted updates.

### `.storybook/main.ts`

```ts
addons: [
  {
    name: "./visual-delta-preset.ts", // or package name when published
    options: {
      visualDelta: {
        baselinePathMode: "nested-import",
        // visualServerPort defaults to Storybook port + 1
        visualTestArgs: ["exec", "playwright", "test"],
        visualUpdateArgs: [
          "exec",
          "tsx",
          "scripts/ui-generator/cli.ts",
          "visual-update",
          "--allow-dirty",
          "--approved",
          "--skip-build",
        ],
        visualInteractionUpdateArgs: [
          "exec",
          "tsx",
          "scripts/ui-generator/cli.ts",
          "visual-interaction-update",
          "--allow-dirty",
          "--approved",
          "--skip-build",
        ],
      },
    },
  },
],
// `/visual-baselines` is mounted by the addon preset `staticDirs`.
```

### Developing the addon from source (optional)

When editing this package’s `src/` next to Storybook, Storybook’s manager
builder may not pick up `node_modules` changes. A small local preset that
points `manager` / `preview` at absolute `src/` files (and re-exports
`staticDirs` / `viteFinal` from the package) avoids that. Those entry hooks
are required on the local preset because registering a file path does not
trigger Storybook’s package `./manager` / `./preview` auto-load:

```ts
// .storybook/visual-delta-preset.ts
import { fileURLToPath } from "node:url";

const addonSrc = (entry: string) =>
  fileURLToPath(
    import.meta.resolve(
      `../packages/storybook-addon-visual-delta/src/${entry}`,
    ),
  );

export function previewAnnotations(entry: string[] = []) {
  return [...entry, addonSrc("preview.ts")];
}

export function managerEntries(entry: string[] = []) {
  return [...entry, addonSrc("manager.tsx")];
}

export {
  staticDirs,
  viteFinal,
  webpack,
} from "../packages/storybook-addon-visual-delta/src/preset.js";
```

```ts
addons: [import.meta.resolve("./visual-delta-preset.ts")],
```

Published / installed consumers can use the package name instead.

## Further reading

- [`VENDOR.md`](./VENDOR.md) — behavior details, catalog fixtures, upstream notes
- Package Vitest project: `pnpm exec vitest run --project visual-delta`
