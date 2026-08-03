# Visual Delta configuration

This reference defines every configuration layer and its precedence. It separates durable project policy, story-specific capture settings, host capabilities, environment overrides, and local presentation preferences.

## Normative requirements

These requirements keep configuration precedence explicit and preserve safe defaults.

| ID          | Requirement                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-CONF-001 | Effective capture settings MUST resolve in this order: explicit story value, project default, built-in default. An absent value falls through; a valid falsy value does not.                    |
| VD-CONF-002 | Host options MUST configure integration capabilities and paths. They MUST NOT override an explicit story capture value. `snapshotDir` MAY resolve outside `root`; the built-in runner MUST stage that declared baseline directory as an isolated input without staging its parent repository. |
| VD-CONF-003 | `.visual-delta/config.json` MUST be the durable project configuration. `.visual-delta/artifacts/` and `.visual-delta/cache/` MUST be the default derived artifact and affected-cache roots and SHOULD be ignored by version control independently so `config.json` and `runner.mjs` remain trackable. A project MAY cache the derived roots. `captureWorkspaceIgnore` MAY exclude validated root-relative directories but MUST NOT suppress these package-owned roots. The legacy `.visual-delta/playwright.json` MAY supply only the Playwright pass threshold when the project file does not. |
| VD-CONF-004 | `parameters.visualDelta` MUST contain story-owned baseline wiring and story-specific overrides. Interaction entries MUST use `{ id, label, src }`.                                              |
| VD-CONF-005 | Browser storage MUST contain presentation or session preferences only. It MUST NOT authorize writes, change durable capture policy, establish review state, or alter action scope.              |
| VD-CONF-006 | Environment variables MAY select ports and explicitly authorized update modes. Compare-only entry points MUST force snapshot updates off regardless of inherited environment.                   |
| VD-CONF-007 | Host options MAY force `readOnly: true`. When `readOnly` is true, or Storybook `CONFIG_TYPE` is not `DEVELOPMENT`, or development middleware capability discovery reports unsupported, the manager and panel MUST resolve a read-only capability set: writes, Diff Browser, runs, configuration mutation, change sets, init scaffolding, baseline history, and the Testing Module MUST be unavailable. Overlay, Diff HTML, Diff Result hydrate, and `/visual-baselines` serving MUST remain available when wired. |
| VD-CONF-008 | Project browser configuration MUST be a non-empty unique subset of `chromium`, `firefox`, and `webkit`, defaulting to only `chromium`. Visual test failure mode MUST be `warn` or `strict`, defaulting to `warn`; an explicit CLI value wins over `VISUAL_DELTA_FAILURE_MODE`, project workflow, and the built-in default. `workflow.reuseActualComparisons` MUST be boolean and default to `true`; an explicit fresh-capture request MUST bypass reuse without changing that setting. The built-in changed-pixel allowance MUST be `0.063%`; the independent built-in per-pixel `diffThreshold` MUST also be `0.063`. |

## Configuration precedence

The layers resolve from highest to lowest priority:

1. Exact story values in `parameters.visualDelta`
2. Project defaults in `.visual-delta/config.json`
3. Legacy Playwright threshold in `.visual-delta/playwright.json`, for that setting only
4. Built-in defaults

Host options resolve separately. An explicit `visualServerPort` host option wins, followed by `VISUAL_SERVER_PORT` or `VISUAL_DELTA_SERVER_PORT`, then `STORYBOOK_PORT + 1`, then the package fallback.

Local panel preferences can change how one browser displays a comparison. They do not change the effective capture configuration sent to Playwright.

## Project configuration

`.visual-delta/config.json` contains the editable default keys, MAY contain a `browsers` array, a `workflow` object, and a `captureWorkspaceIgnore` array. Readers MAY accept the older `projectDefaults` wrapper. Unknown or invalid editable keys MUST produce diagnostics and MUST NOT be applied.

`browsers` defaults to `["chromium"]`. The supported values are `chromium`, `firefox`, and `webkit`; duplicates, unknown names, and an empty array are invalid. WebKit is presented as WebKit, not Safari. Each configured browser creates one independent baseline target in the canonical capture profile.

`captureWorkspaceIgnore` defaults to `[]`. Each entry is a unique,
root-relative directory path without `.` or `..` segments; a trailing slash is
normalized away. The built-in runner excludes that directory and its descendants
from both the clean staged copy and the post-run artifact candidate inventory.
This is intended for derived tool caches such as `.nx/cache`; it MUST NOT be
used to omit source, baselines, or configuration required by the clean build.
Package-owned affected cache files retain their explicit transport allow-list
even if an ancestor cache directory would otherwise be ignored.

The built-in project defaults are:

| Setting                   | Built-in value   | Valid values                                |
| ------------------------- | ---------------- | ------------------------------------------- |
| `passThresholdPercent`    | `0.063`          | Number from `0` to `100`                    |
| `diffThreshold`           | `0.063`          | Number from `0` to `1`                      |
| `diffIncludeAntiAliasing` | `false`          | Boolean                                     |
| `delay`                   | `0`              | Integer from `0` to `60000` ms              |
| `deviceScaleFactor`       | `1`              | Integer from `1` to `8`                     |
| `cropToViewport`          | `false`          | Boolean                                     |
| `placement`               | `right`          | `left`, `right`, `above`, `below`, `center` |
| `opacity`                 | `0.5`            | Number from `0` to `1`                      |
| `baselineLabelOffset`     | `{ x: 0, y: 0 }` | Each value from `-1000` to `1000`           |
| `previewSplitZoomDefault` | `fit`            | `fit` or `100%` — applied when a split opens; follow-up INIT after config load MUST adopt this when zoom is still the prior default |
| `diffResultZoomDefault`   | `100%`           | `fit` or `100%`                             |

An explicitly configured story value is a story override and wins over the project default of `0.063`. Package-generated wiring MUST omit a threshold so the project default applies unless the consumer deliberately supplies a story value. Implementations MUST expose the winning source so the panel can explain the effective value.

The workflow defaults are:

| Setting                                   | Built-in value                   | Meaning                                             |
| ----------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `workflow.autoAcceptLiveStoryComparisons` | `false`                          | Do not Accept after Diff Browser / Story / Testing Module Run Diff  |
| `workflow.visualTestFailureMode`           | `warn`                           | Report missing baselines and visual mismatches without a failing process |
| `workflow.reuseActualComparisons`          | `true`                           | Recompare a proven-fresh canonical actual unless Fresh is requested |
| `workflow.vcs.mode`                       | `off`                            | Do not prepare or create repository commits         |
| `workflow.vcs.commitMessageTemplate`      | `Visual Delta: {action} {scope}` | Template for an allowed local commit                |

Valid commit message tokens are `{action}`, `{scope}`, `{storyId}`, `{storyName}`, and `{count}`.

## Story parameters

`parameters.visualDelta` MAY define:

| Field                     | Contract                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| `images`                  | One URL or image entries for primary and mode baselines               |
| `interactions`            | Array of `{ id, label, src }` interaction baselines                   |
| `modes`                   | Named global combinations, optionally with a baseline `src`           |
| `anchor`                  | Selector or anchor used by compatible overlay behavior                |
| `offsetX`, `offsetY`      | Numeric display offsets                                               |
| `align`                   | `viewport` or `canvas`                                                |
| `placement`               | Current values plus legacy `beside` and `over`, normalized at runtime |
| `opacity`                 | Display opacity from `0` to `1`                                       |
| `baselineLabelOffset`     | Baseline chip offset                                                  |
| `colorInversion`          | Display-only inversion flag                                           |
| `passThresholdPercent`    | Allowed differing-pixel percentage                                    |
| `diffThreshold`           | Per-pixel color threshold from `0` to `1`                             |
| `diffIncludeAntiAliasing` | Whether anti-aliased pixels count                                     |
| `delay`                   | Additional settle delay in milliseconds                               |
| `deviceScaleFactor`       | Capture / display density when image entries omit it                  |
| `ignoreSelectors`         | CSS selectors whose painted regions do not count                      |
| `cropToViewport`          | Capture the viewport instead of the component subject                 |

Primary image entries MAY carry `deviceScaleFactor`, `viewport`, `mode`, `align`, `placement`, offsets, and anchor metadata. When an image omits `deviceScaleFactor`, the effective value MUST resolve from the story override, then the project default, then the built-in default `1`. Legacy placement values MUST normalize to `right` for `beside` and `center` for `over`.

## Host options

`options.visualDelta` MAY define:

| Option                        | Purpose                                        | Default                                    |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------ |
| `showToolbarStatusLabels`     | Show named toolbar review status               | `true`                                     |
| `root`                        | Repository root for paths and spawned commands | Vite root or current working directory     |
| `snapshotDir`                 | Baseline directory                             | `tests/visual/storybook.spec.ts-snapshots` |
| `baselinePathMode`            | Baseline identity strategy                     | `story-id`                                 |
| `addonSrcDir`                 | Local addon source watch path                  | unset                                      |
| `visualUpdateArgs`            | Approved primary writer command                | Packaged `visual-delta update`             |
| `visualInteractionUpdateArgs` | Approved interaction writer command            | Packaged `visual-delta interaction-update` |
| `visualTestArgs`              | Compare-only command                           | `pnpm exec playwright test`                |
| `visualServerPort`            | Static Storybook server port                   | Storybook port plus one                    |
| `allowRebuild`                | Permit middleware-triggered static builds      | `true`                                     |
| `allowVcsWrites`              | Second gate for plugin-managed commits         | `false`                                    |
| `readOnly`                    | Force static read-only preview capabilities    | unset (`false`); static builds imply read-only via `CONFIG_TYPE` |
| `affectedTests`               | Affected cache, external, and untraced policy  | disabled unless configured                 |

`affectedTests.untraced` reduces coverage and MUST remain opt-in. Invalid affected configuration MUST fall back to a full eligible-story selection.

## Browser storage

The panel stores display settings under `storybook-addon-visual-delta/settings`. It MAY persist overlay visibility, placement, opacity, inversion, live visibility, and per-engine display thresholds.

The Testing Module stores compare, baseline-write, result-status, affected-only, and baseline-mode preferences under versioned keys. Its safe defaults are compare on, baseline writes off, result-status updates off, affected-only on, and create-missing mode.

Session storage MAY retain interaction parking, a pinned interaction source, and reconnectable run identifiers. Every session value MUST be disposable.

## Environment variables

The supported process controls are:

| Variable                              | Contract                                                             |
| ------------------------------------- | -------------------------------------------------------------------- |
| `STORYBOOK_PORT`                      | Base Storybook port                                                  |
| `VISUAL_SERVER_PORT`                  | Preferred explicit static server port                                |
| `VISUAL_DELTA_SERVER_PORT`            | Legacy static server port alias                                      |
| `VISUAL_DELTA_PASS_THRESHOLD_PERCENT` | Explicit process override for the Playwright threshold               |
| `VISUAL_DELTA_BASELINE_PATH_MODE`     | CLI-to-suite path mode                                               |
| `VISUAL_DELTA_SNAPSHOT_DIR`           | CLI-to-suite snapshot directory                                      |
| `VISUAL_DELTA_FAILURE_MODE`            | `warn` or `strict` compare-result process policy                     |
| `PLAYWRIGHT_UPDATE_SNAPSHOTS`         | Enables writes only when exactly `1` and an approved writer set it   |
| `PLAYWRIGHT_UPDATE_MODE`              | `missing` for create-only, otherwise all requested targets           |
| `VISUAL_UPDATE_APPROVED`              | Explicit baseline-write approval when exactly `1`                    |
| `PLAYWRIGHT_INTERACTION_CAPTURE`      | Exact interaction capture request for an approved writer             |
| `CI`                                  | Disables reused servers and limits workers through Playwright config |

Related contracts: [Baseline model](./baseline-model.md), [Capture and comparison](./capture-and-comparison.md), [Mutations and review](./mutations-and-review.md), and [UI catalog host profile](./host-profile.md).
