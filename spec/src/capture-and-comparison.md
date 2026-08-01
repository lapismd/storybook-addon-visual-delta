# Visual Delta capture and comparison

This reference defines the browser environment, readiness handshake, capture target, geometry, ignored regions, comparison authority, and result classification. The same effective contract applies to live Chromium and static Playwright paths.

## Normative requirements

These requirements make authoritative captures deterministic and distinguish them from diagnostics.

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-CAP-001 | Authoritative captures MUST use the selected configured Playwright browser (`chromium`, `firefox`, or `webkit`) at a `1280 × 900` CSS viewport, the effective device scale factor from configuration (image entry → story → project → built-in default `1`), light color scheme, `en-GB`, `Europe/London`, reduced motion, hidden caret, and disabled animations.                                                                                                                                                                  |
| VD-CAP-002 | Capture MUST wait for the exact story generation to reach its requested boundary, relevant fonts to load, preparation chrome to disappear, the configured delay, and stable body, root, and capture-target geometry. End-of-play uses Storybook completion; an interaction uses completion of its exact parked step or instrumenter call even when Storybook does not emit end-of-play completion. Completion and cleanup MUST remain scoped to that render generation across same-story rerenders. A fixed padding fallback MUST NOT substitute for measured geometry. |
| VD-CAP-003 | Target selection MUST use the viewport when cropped, the union of the subject and visible overlay surfaces that paint outside the subject when an overlay is open, the first story-root child otherwise, and the viewport only when no subject can be resolved. The same target resolver MUST cover both outside-root portals and positioned in-root surfaces.                                                                                                                                                                                                          |
| VD-CAP-004 | Ignore selectors MUST combine built-in markers, compatible Chromatic markers, and story selectors. Invalid selectors MUST be reported or ignored safely without aborting unrelated selectors.                                                                                                                                                                                                                                                                                                                                                                           |
| VD-CAP-005 | Baseline images MUST display at CSS size using their device scale factor. Overlay and split alignment MUST reconstruct measured body, root, and subject insets and report geometry mismatches.                                                                                                                                                                                                                                                                                                                                                                          |
| VD-CAP-006 | Live HTML comparison MUST remain diagnostic. Exact-story configured-browser and static Playwright comparisons are authoritative and MUST share one outcome classifier and the canonical Linux/ARM64 capture profile. Baselines MUST be compared only with captures for the same browser target and matching profile; platform and architecture are provenance rather than baseline dimensions. |
| VD-CAP-007 | Missing baselines and pixel mismatches MUST be recorded as non-passing comparison outcomes. In `warn` mode they MUST log/annotate warnings and allow a successful process exit; in `strict` mode they MUST fail the comparison process. Capture, readiness, configuration, browser-launch, decoding, and baseline-write errors remain fatal in both modes. |

`VD-CAP-001` also applies to repository-owned baseline generators. They MUST
apply the shared deterministic story settlement before writing a baseline so
incidental post-interaction focus is blurred consistently with authoritative
comparison captures. A focus state MAY remain only when it is the explicit
subject under test.

## Deterministic browser environment

The authoritative environment is:

| Setting                    | Value                                                           |
| -------------------------- | --------------------------------------------------------------- |
| Browser project            | Selected configured Chromium, Firefox, or WebKit                 |
| CSS viewport               | `1280 × 900`                                                    |
| Device scale factor        | Effective configured value; built-in default `1`                |
| Screenshot scale           | Device pixels                                                   |
| Color scheme               | Light                                                           |
| Locale                     | `en-GB`                                                         |
| Time zone                  | `Europe/London`                                                 |
| Motion                     | Reduced                                                         |
| Animations and transitions | Disabled during capture                                         |
| Caret                      | Hidden                                                          |
| Focus                      | Blurred before capture when focus is not the subject under test |

Hosts MAY set project or story `deviceScaleFactor` (for example `3` for existing device-pixel baselines). Changing the effective scale without migrating baselines is a host responsibility. Other environment values MUST NOT change without a specification change and baseline migration.

## Readiness handshake

The preview assigns a monotonically increasing generation to each render, including same-story rerenders and remounts. Every generation starts unfinished. For a normal target, the preview marks readiness only after Storybook’s exact `storyFinished` event for the active story and generation. For a requested mid-play target, completion of the exact parked named step or instrumenter call marks that active generation ready because the play function intentionally cannot reach end-of-play. Delayed completion or cleanup from an older generation MUST NOT finish or clear a newer generation.

Capture then waits for:

1. The requested viewport to match exactly
2. Storybook preparation overlays to disappear
3. Fonts used by the body, story root, subject, and visible overlay surfaces to settle
4. Body, root, capture target, and viewport geometry to remain stable across consecutive animation frames
5. The configured delay to elapse
6. The target interaction marker, when capturing an interaction

A navigation, iframe replacement, remount, or newer generation cancels the old readiness claim. A live interaction replay MUST publish its exact parked marker and generation readiness before baseline geometry is measured. One retry MAY occur after an iframe replacement if the same exact request remains active.

## Capture target resolution

Target resolution follows this order:

1. If `cropToViewport` is true, capture the visible viewport
2. If visible dialogs, listboxes, menus, or open-state surfaces paint outside the subject bounds, capture their union with the subject. This includes portals outside `#storybook-root` and fixed or absolutely positioned descendants inside it
3. If `#storybook-root` has a child, capture its first child
4. If the root has no child, capture the root or visible viewport as the engine permits

Overlay candidates include visible dialogs, listboxes, menus, and open-state elements. An in-root candidate that remains entirely within the subject bounds does not extend the clip, so ordinary expanded content such as an accordion does not become a portal capture. Invisible or zero-area candidates do not extend the clip.

Interaction capture replays to an exact named step or Storybook instrumenter call. Both static and live replay wait for `data-visual-capture-ready` to match the interaction ID, mark that exact render generation ready, and only then apply the normal font and geometry settle contract.

## Ignored painted regions

The ignore set includes:

- Elements with `data-visual-delta-ignore`
- Supported Chromatic ignore markers
- Nodes matched by `parameters.visualDelta.ignoreSelectors`

Playwright masks matching locators. Live HTML capture hides the same painted regions for the capture duration and restores their prior styles afterward.

The highlight tool MAY show matched regions in the preview. Highlighting is presentation state and MUST be removed before capture.

## Geometry and alignment

PNG natural dimensions are device pixels. Display dimensions equal natural dimensions divided by the recorded device scale factor.

For component captures, preview alignment measures:

- Body content bounds and painted background
- `#storybook-root` content bounds and padding
- Subject bounds, margins, and painted background
- The subject-and-overlay union when a visible overlay extends the capture target
- Requested viewport and current scroll origin

Viewport-aligned and viewport-cropped baselines use the viewport frame. Component-aligned baselines reconstruct measured outer insets. Centered Storybook layouts center equivalent live and baseline frames.

A mismatch between baseline CSS dimensions and the same settled live capture target produces a geometry warning. The live side MUST use the subject-and-overlay union whenever the authoritative capture did; comparing an overlay baseline only with the subject box is invalid. An inferred difference between dimensions and configured alignment produces an alignment warning. Warnings do not change the pixel outcome.

## Comparison engines

Visual Delta has three comparison presentations:

| Engine            | Input                                          | Authority                          | Durable evidence                         |
| ----------------- | ---------------------------------------------- | ---------------------------------- | ---------------------------------------- |
| Diff HTML         | Live DOM rasterization and baseline PNG        | Diagnostic only                    | None required                            |
| Diff Browser      | Exact live story in the selected Playwright browser and matching baseline PNG | Authoritative for one exact target | Sidecar and diagnostic PNGs              |
| Static Playwright | Static Storybook and selected baseline targets | Authoritative for scoped runs      | Sidecars, diagnostics, Playwright result |

Diff HTML MUST label itself as diagnostic and MUST NOT approve, fail, create, update, or delete a baseline. Diff Browser and static Playwright MUST use the same thresholds and outcome classifier for equivalent inputs.

## Thresholds and outcomes

`diffThreshold` controls the per-pixel color delta. `passThresholdPercent` controls the allowed percentage of differing pixels. Anti-aliasing policy controls whether pixelmatch includes anti-aliased differences.

The classifier returns:

| Outcome                    | Meaning                                                |
| -------------------------- | ------------------------------------------------------ |
| `passed`                   | No meaningful pixel difference                         |
| `changed-within-tolerance` | Differences exist but remain within the pass threshold |
| `mismatch`                 | Differences exceed the pass threshold                  |
| `missing-baseline`         | The expected target does not exist                     |
| `error`                    | Capture, decoding, dimension, or comparison failed     |
| `skipped`                  | Eligibility or explicit run policy excluded the target |

Runner status and outcome remain separate. A test process can finish successfully while reporting `changed-within-tolerance`, and a process failure can carry a more specific comparison outcome.

Related contracts: [Baseline model](./baseline-model.md), [Panel and preview](./panel-and-preview.md), [Test runs and scopes](./test-runs-and-scopes.md), and [Verification](./verification.md).
