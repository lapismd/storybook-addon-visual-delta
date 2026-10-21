# Visual Delta for Storybook

[![npm release and provenance](https://github.com/lapismd/storybook-addon-visual-delta/actions/workflows/npm-publish.yml/badge.svg?event=push)](https://github.com/lapismd/storybook-addon-visual-delta/actions/workflows/npm-publish.yml)
[![npm version](https://img.shields.io/npm/v/@lapismd/storybook-addon-visual-delta.svg)](https://www.npmjs.com/package/@lapismd/storybook-addon-visual-delta)
[![Storybook](https://img.shields.io/badge/Storybook-live-ff4785?logo=storybook&logoColor=white)](https://lapismd.github.io/storybook-addon-visual-delta/)

Visual Delta is a local-first visual regression testing addon for Storybook. It compares stories with committed Playwright screenshots and adds baseline review, overlays, diffs, and visual test controls to Storybook.

## Requirements

- A Storybook project using Vite
- React, which renders the addon panel
- Playwright for browser capture
- Docker for the default Linux ARM64 runner, or installed browsers for native capture

Visual Delta supports Chromium, Firefox, and WebKit. New projects enable Chromium only.

## Install

From your Storybook project, install and register the addon:

```bash
npx storybook add @lapismd/storybook-addon-visual-delta
pnpm add -D playwright react
pnpm exec playwright install chromium
pnpm exec visual-delta init
```

`visual-delta init` creates the Playwright suite, Playwright configuration, snapshot directory, and package scripts. It preserves existing files unless you pass `--force`.

The generated files are:

```text
playwright.config.ts
tests/visual/storybook.spec.ts
tests/visual/storybook.spec.ts-snapshots/
```

It also adds `build-storybook`, `test:visual`, `test:visual:affected`, and `visual-delta` scripts when they do not already exist.

## Check an installation

Run the fast, read-only doctor after setup or an upgrade:

```bash
pnpm exec visual-delta doctor
```

It validates Storybook registration, the portable Playwright suite, package
dependencies and scripts, resolved capture settings, snapshot ownership, and
Visual Delta artifact/cache placement. The default check does not build
Storybook, start Docker, launch a browser, or write files.

Use the opt-in checks and repairs when needed:

```bash
pnpm exec visual-delta doctor --runner
pnpm exec visual-delta doctor --build
pnpm exec visual-delta doctor --strict --json
pnpm exec visual-delta doctor --fix
```

`--runner` performs the existing Docker or custom-runner probe. `--build`
refreshes static Storybook before authoritative orphan analysis. `--fix` only
moves verified v4 actual/diff/result evidence into `.visual-delta/artifacts/`,
quarantines obsolete derived files under `.visual-delta/cache/doctor-quarantine/`,
and migrates the legacy change-set cache. It never modifies committed baseline
PNGs, story sources, or project configuration, and it never overwrites a
destination.

## Register the addon manually

If the Storybook CLI did not update your configuration, add the package to the existing `addons` array in `.storybook/main.ts`:

```ts
export default {
  addons: ["@lapismd/storybook-addon-visual-delta"],
};
```

If you do not want to use `visual-delta init`, create the suite and Playwright configuration yourself.

```ts
// tests/visual/storybook.spec.ts
import { defineVisualSuite } from "@lapismd/storybook-addon-visual-delta/playwright";

defineVisualSuite();
```

```ts
// playwright.config.ts
import { defineVisualPlaywrightConfig } from "@lapismd/storybook-addon-visual-delta/playwright";

export default defineVisualPlaywrightConfig();
```

## Create a baseline

Start Storybook and open a story:

```bash
pnpm storybook
```

Open the **Visual Delta** panel, select the browser, and choose **Create visual**. Review the captured PNG before committing it to your repository.

The default snapshot directory is `tests/visual/storybook.spec.ts-snapshots`. Baseline names contain the story and browser, for example `components-button--primary-chromium.png`.

## Run visual tests

Check the full capture environment before the first authoritative run (the
legacy runner-only spelling remains supported):

```bash
pnpm exec visual-delta doctor --runner
```

Run every eligible story:

```bash
pnpm test:visual
```

Run only stories affected by local changes:

```bash
pnpm test:visual:affected
```

Missing baselines and visual mismatches are warnings by default. Use strict mode when they should fail CI:

```bash
pnpm exec visual-delta test --all --failure-mode strict
```

Compare one exact story with the same runner-backed suite used by Diff Browser:

```bash
pnpm exec visual-delta test --story-id examples-card--default --browser chromium
```

Compare-only commands never create or update baselines.
They write mirrored `.actual.png`, `.diff.png`, and `.result.json` evidence to
`.visual-delta/artifacts/`; affected planning state lives in
`.visual-delta/cache/`, including UI change-set history at
`.visual-delta/cache/change-sets/` and verified canonical Storybook builds at
`.visual-delta/cache/canonical-build/`. Both roots are ignored by default, but
projects may cache or commit them. Add `--fresh` to bypass a reusable actual
once while retaining the canonical build cache; add `--rebuild` to force a new
canonical Storybook build. Affected selection is enabled conservatively when
the addon option is omitted; set `affectedTests: false` to opt out.

## Configure browsers and comparison defaults

Add `.visual-delta/config.json` when the built-in defaults are not suitable:

```json
{
  "browsers": ["chromium", "firefox", "webkit"],
  "captureWorkspaceIgnore": [".nx/cache"],
  "workflow": {
    "visualTestFailureMode": "strict",
    "reuseActualComparisons": true
  }
}
```

Install local browser binaries for native capture, host-local diagnostics, or direct Playwright runs:

```bash
pnpm exec playwright install chromium firefox webkit
```

`captureWorkspaceIgnore` accepts root-relative derived-cache directories that
the clean runner should omit. The runner already excludes common caches such as
`.turbo`; use this setting for tool-specific caches without waiting for another
package release.

The built-in comparison allows up to `0.063%` differing pixels and uses a
`0.063` per-pixel color threshold. Project and story settings can override these
values.

The default runner executes authoritative comparisons in the pinned Linux ARM64 capture profile. Diff Browser, the Testing Module, and command-line tests all invoke the same packaged Playwright worker through that runner. Projects that cannot use Docker can provide `.visual-delta/runner.mjs` to transport the same capture job through another environment.

## Native capture on your machine

Create the ignored `.visual-delta/config.local.json` to run locally without
Docker. Project configuration can use the same `capture` section.

```json
{
  "capture": { "profile": "native" },
  "browsers": ["chromium"],
  "passThresholdPercent": 0.5
}
```

The threshold above is an example local allowance; the built-in default remains
`0.063%`. Local capture and comparison defaults overlay project settings, while
explicit story values still win. Local settings cannot enable write or commit
automation. CI ignores the local file, and `--no-local-config` disables it for
a reproducible local invocation.

Install the selected Playwright browsers, then create and verify an exact story:

```bash
pnpm exec playwright install chromium
pnpm exec visual-delta doctor --runner --capture-profile native
pnpm exec visual-delta update --story-id button--basic --approved --create-only
pnpm exec visual-delta test --story-id button--basic --failure-mode strict --fresh
```

The default static server uses Node and does not require Python.

Native capture uses the installed project dependencies on macOS or Linux, ARM64
or x64. It preserves browser, mode and interaction variants. With the default
snapshot directory, the macOS ARM64 primary PNG is persisted at:

```text
tests/visual/storybook.spec.ts-snapshots/profiles/native/darwin-arm64/button--basic-chromium.png
.visual-delta/artifacts/profiles/native/darwin-arm64/button--basic-chromium.actual.png
.visual-delta/artifacts/profiles/native/darwin-arm64/button--basic-chromium.diff.png
.visual-delta/artifacts/profiles/native/darwin-arm64/button--basic-chromium.result.json
```

Diff Browser and the Testing Module use the same selected profile and PNGs.
Restart Storybook after changing profiles. Native provenance records the actual
OS, architecture, Node, Playwright and browser versions. Without a locked native
font environment, runs capture fresh images and conservatively retain affected
stories instead of reusing persistent passing evidence.

For named configurations, define `capture.profiles` entries with an `adapter`
(`docker`, `native`, or `custom`), optional `defaults`, `browsers`,
`snapshotDir`, and a `runner` module
for custom adapters. `--capture-profile <name>` wins over
`VISUAL_DELTA_CAPTURE_PROFILE`, local configuration and project configuration.
An explicit `--snapshot-dir` wins over a profile's directory default. Native
baseline writes require a directory inside the project; external directories
remain available for read-only comparison. Default Docker paths and existing
`.visual-delta/runner.mjs` integrations remain compatible.

Contributors can run `pnpm test:native` for an isolated Storybook-compatible
example exercising capture, unchanged verification, mismatch and missing
baseline outcomes. Its generated PNGs remain under
`.visual-delta/cache/native-example/` for inspection. Set
`VISUAL_DELTA_NATIVE_EXAMPLE_BROWSERS=chromium,firefox,webkit` to exercise the
full installed native browser matrix.

## Further documentation

- [System specification](./spec/src/index.md)
- [Configuration reference](./spec/src/configuration.md)
- [Baseline names and artifacts](./spec/src/baseline-model.md)
- [Capture and comparison behavior](./spec/src/capture-and-comparison.md)
- [CLI and public interfaces](./spec/src/interfaces.md)
- [Mutation and review safety](./spec/src/mutations-and-review.md)
- [Contributor guide](./DEVELOPMENT.md)

## License

[MIT](./LICENSE)
