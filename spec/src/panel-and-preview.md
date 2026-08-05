# Visual Delta panel and preview

This reference defines the interactive Storybook surfaces and their shared state. It covers baseline selection, placement, modes, interactions, comparisons, review controls, persistence, hot reload, and teardown.

## Normative requirements

These requirements keep interactive state recoverable and separate from durable system state.

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-UI-001 | The panel MUST present coverage, comparison outcome, review status, skip eligibility, and run state as separate concepts. A control MUST mutate only the concept it names. Panel coverage and preview comparison MUST resolve the same exact selected browser target: a displayed selected-browser baseline MUST NOT be labelled missing or offer Create, and a browser without a matching baseline MUST NOT retain another browser's overlay. When an eligible missing target becomes ready, the panel MUST expose its exact create action when the backend permits writes. Explicitly targeted unqualified teaching fixtures remain compare-only and MUST NOT expose baseline Create, Update, or Delete actions. Until the coordinated migration closes `VD-GAP-000`, retained platform-qualified host acceptance fixtures MUST remain mutation-capable and MUST NOT be classified as teaching assets. |
| VD-UI-002 | The first available baseline MUST auto-select after the active render becomes ready. An explicit baseline deselection or placement soft hide MUST preserve the selected target, persist overlay visibility for later stories, reloads, and remounts on the same Storybook origin, and remove preview comparison DOM. An explicit baseline or placement selection MAY restore and persist visibility. Navigation away from Canvas MUST remove all preview comparison DOM without changing the persisted visibility preference. Automatic INIT, manager fallback, mode or interaction recovery, and hot-module recovery MUST NOT rewrite that preference. |
| VD-UI-003 | Split placements MUST provide equal comparison panes with synchronized two-dimensional navigation. The placement pad MUST remain available when captured mode has fresh actual evidence and MUST describe the selected baseline position relative to the actual image. When manual overlay-position reset is applicable, the placement pad MUST own that action as an icon-only control in its bottom-right cell; a separate toolbar text action MUST NOT remain. In live mode, Fit MUST derive baseline CSS dimensions from the PNG and its device scale factor, project the live Storybook root from the measured manager viewport to the baseline capture width while preserving measured outer width, and apply one resolved scale to the baseline image and live component. In captured mode with fresh actual evidence, Fit MUST use the larger native CSS extent and apply one scale to the raw actual and baseline while preserving their real dimensions; center MUST place the baseline overlay above the actual at the same origin. A fresh authoritative Diff Browser or command-line result MUST make its checksum- and fingerprint-validated actual available to captured mode for every placement; it MUST NOT silently retain the baseline-only fallback. Without a fresh actual, captured mode MUST retain the baseline-only centered fallback. Fit and native `100%` commands MUST use icon-only Storybook buttons with concise action tooltips and accessible labels. The Fit glyph MUST present its inward arrows on a 45-degree diagonal and converge toward their center on hover or keyboard focus; reduced-motion preference MUST remove the transition without changing the glyph's diagonal identity. Explicit Fit, native `100%`, and bounded custom zoom choices MUST persist for later stories, reloads, and remounts on the same Storybook origin. The project `previewSplitZoomDefault` MUST apply only when no persisted user choice exists or local settings are reset; a resolved Fit scale is derived state and MUST be recomputed for the current slot. Placement changes, INIT, and preview zoom-status events MUST NOT replace the persisted user choice. A layout refresh, shared-extent refresh, or split-chrome rebuild for the same active selection MUST reapply the active shared scroll position, clamped only to the resulting common extent, and MUST NOT treat its programmatic scroll events as user navigation. A hard selection clear MAY reset that position. |
| VD-UI-004 | Named modes MUST apply their exact Storybook globals. The Default/mode baseline control MUST have outer dimensions matching the directional placement pad. With multiple selectable Default/mode choices it MUST be a column split control: its top image segment MUST show the active baseline as a centered, uncropped preview and open that image in the shared full-image lightbox, while its full-width bottom segment MUST be the sole selector and MUST omit a separate `Mode` label. With only one selectable baseline, the selector segment MUST be absent and the full control MUST remain an uninterrupted image-only lightbox button. The control MUST replace the standalone primary toolbar thumbnail. Its dropdown MUST show every resolved baseline beside its name in a centered, uncropped preview frame comparable in size to the lightbox trigger. A selected mode MUST survive the same-story INIT and remount caused by applying its globals, keep its matching baseline selected, and fall back to Default only when that mode or baseline is no longer available. Interaction rows MUST represent `{ id, label, src }`, support deterministic replay, and distinguish discovered points from wired baselines. Replay MUST publish readiness for the exact parked generation before geometry or comparison work begins. An unwired discovered point MUST expose creation for that exact point when the backend permits writes. The bounded interaction list MUST own vertical overflow so every row and action remains reachable. |
| VD-UI-005 | Diff Browser MUST stream the capture runner's accumulating log to the panel status surface while retaining structured progress, cached-actual provenance, and terminal errors. Its successful terminal sidecar MUST populate capture diagnostics immediately, including the requested viewport, device scale factor, and captured bitmap dimensions; a delayed or failed follow-up artifact-image hydration MUST NOT suppress those authoritative diagnostics. The expanded log MUST render safe ANSI SGR foreground, background, and emphasis formatting, normalize common in-place terminal updates, remove unsupported control sequences, and treat all runner content as text. Accessible labels and copied output MUST use the normalized plain text. Diff result views MUST hydrate fresh version 4 results and diagnostic images from `/visual-delta-artifacts` and present 2-up, Swipe, Diff, Focus, and Blink over one aligned pixel coordinate system. Failed fetches and stale evidence MUST NOT poison current state. Every browser-comparison surface MUST expose a one-shot fresh-capture action. |
| VD-UI-006 | Manager and preview remounts MUST recover selection and run state through events or middleware. Story-scoped job progress and terminal effects MUST remain bound to the originating story: navigation MUST stop presenting them for another story and MUST NOT hydrate that story. On active storyId change the panel MUST hard-clear the prior story gallery and selection before requesting INIT for the new story. Baseline overlay chrome MUST remain hidden until the active generation's image has non-zero decoded dimensions, its CSS size has been derived from device scale, and its final placement or Fit layout has been applied. A failed, unloaded, or stale-generation image MUST NOT remain visible. Event listeners and injected DOM MUST be fully torn down when inactive. |
| VD-UI-007 | Local presentation settings MAY persist in browser storage. Persistence MUST be preference-specific: an explicit control MUST update only the preference it owns, while automatic hydration, fallback, comparison status, and temporary post-mutation review presentation MUST NOT rewrite unrelated preferences. Durable configuration, review metadata, coverage, and mutation authorization MUST come from project or source state. |
| VD-UI-008 | In read-only capability mode (static Storybook or host `readOnly`), the panel MUST keep baseline and mode selection, placement, soft hide, opacity, zoom, interaction replay, Diff HTML, and Diff Result hydrate available when data exists. It MUST NOT present enabled Create, Update, Delete, skip/include mutation, Accept, Diff Browser, Story official compare, Run visual, Rebuild static, Configuration save, Changes/VCS, Init scaffold, or baseline history actions. Empty states MUST NOT offer Create visual or Set up Visual Delta; they MUST explain that baselines are wired through story parameters or require a development host. |
| VD-UI-009 | The panel MUST expose one joined Profile × Browser control with a read-only canonical-profile indicator on the left and the browser selector on the right, each with a recognizable icon. The profile indicator MUST present Linux/ARM64 and expose detailed provenance in its accessible tooltip. Chromium is the initial browser; the option set combines configured and canonically discovered browsers. Disabled discovered browsers remain view-only. Selection MUST resolve exact browser images, history, and sidecars, persist only as presentation state, and never fall back to another browser. |
| VD-UI-010 | The persistent bottom status footer MUST span the full visible Visual Delta panel width in idle, logging, environment-selection, and running states. Its top edge MUST meet the panel's left edge without a rounded top-left corner or an inset left border. A streamed ANSI status line MUST render a contrast-safe foreground and emphasis subset while ignoring ANSI backgrounds and inverse styling; raw colour or control tokens MUST NOT appear in visible or accessible footer text. The expanded log MUST be a labelled non-modal popover; opening it MUST NOT make the footer inert or intercept pointer or keyboard access to another footer control. Whenever the footer presents an active cancellable run, it MUST expose an accessible Stop action outside the log popover; that action MUST remain operable while the log is open, when preview readiness is unknown, or when the story failed to render. |
| VD-UI-011 | Development sidebar filters MUST derive a dynamic Browser facet from story-facts and persist `browser.<id>` include/exclude tokens in `visualFilter`. Multiple browser includes use OR; an excluded browser removes a story carrying that primary baseline. Browser filtering combines with existing groups using AND. `Browser coverage gaps` MUST include only non-skipped story leaves with a missing or unresolved required primary browser. Component folders remain visible when at least one child matches. Static/read-only managers without `/story-facts` MUST NOT advertise project-wide sidebar filtering. |
| VD-UI-012 | Every expanded primary or interaction accordion section MUST reserve at least 400 CSS pixels for its body. The bounded baseline list MUST remain the vertical scroll owner and MUST append non-interactive trailing scroll space equal to half the current visible Visual Delta panel height, so the final row and its body can scroll clear of the fixed status footer. |
| VD-UI-013 | Review layout MUST use Storybook's desktop dock at viewports 600 CSS pixels wide or greater and its native addon drawer below that breakpoint. Mobile entry MUST select Visual Delta and open the drawer; exit MUST restore whether that drawer was open or closed before entry, in addition to restoring the prior Storybook navigation, panel position, visibility, and sizes. |

## Panel structure

The Visual Delta panel contains:

- A header with run, create, update, accept, review-layout, filtering, and configuration entry points
- A joined active-baseline lightbox preview and Default/mode selector
- Primary and interaction accordions
- Placement, visibility, opacity, inversion, zoom, and ignore-region controls
- Diff HTML, Diff Browser, and persisted Diff Result surfaces
- A joined read-only Profile-left, Browser-right target split control in the full-width
  persistent status footer
- Review status, baseline history, and change-set views
- Progress, cancellation, missing-coverage, readiness, and diagnostic states

Controls MUST stay disabled when the preview generation is not ready or the required backend capability is unavailable. Disabled controls SHOULD explain the blocking state. In read-only mode, middleware-backed controls MUST be hidden or permanently disabled per `VD-UI-008`.

## Baseline selection and visibility

When a ready story has baselines, the first applicable image auto-selects. The selected index and source define the current comparison target.

Soft hide removes overlay or split DOM but retains the selected target and placement. It also records that overlays are hidden for subsequent stories and remounts. Selecting a baseline or placement again restores the comparison and records it as visible. Hard clear resets story-scoped comparison state when the story changes, the selected target disappears, or Storybook leaves Canvas mode, but it does not change the saved visibility preference. When preview reports `overlay-listener-ready` for a different storyId than the panel session, the panel MUST discard the prior baseline collection, index, and pins before requesting INIT — it MUST NOT keep the previous story’s baseline tag while waiting for the new story.

Baseline image paint requires a `SELECT_IMAGE` with measured `layoutSnapshot` for the active generation. Overlay geometry measurement MUST settle at the manager’s current preview size after the active render is ready; it MUST NOT resize the preview iframe to the Playwright capture viewport (that transaction is reserved for Diff HTML / subject capture). A newly selected image, including an image restored after reload or hot-module replacement, MUST keep its overlay and baseline pane hidden until load succeeds, decoded natural dimensions are non-zero, device-scale CSS dimensions are applied, and placement or Fit layout has been resolved. A load failure MUST remove or hide Baseline chrome for that generation rather than leave a chip or partial bitmap.

The persisted Live/Captured toggle replaces image-only semantics. Captured mode uses a fresh canonical actual instead of the live story for every placement. If no fresh actual exists it hides the live story and displays the baseline alone in center placement while retaining the preferred placement for later recovery. Restoring Live mode MUST restore the prior live comparison without changing durable state.

## Placement and navigation

The placement pad supports the live component or captured Actual image as its
comparison target:

| Placement | Presentation                                 |
| --------- | -------------------------------------------- |
| `left`    | Baseline pane left of the comparison target  |
| `right`   | Baseline pane right of the comparison target |
| `above`   | Baseline pane above the comparison target    |
| `below`   | Baseline pane below the comparison target    |
| `center`  | Baseline ghost over the comparison target    |

Split panes use equal frames that fill the preview iframe split slot (half the viewport on the stacked axis). Left/right and above/below placements MUST show a centered dashed separator between the equal panes; center placement MUST NOT. Both panes expose a shared scroll extent based on the larger content. Vertical and horizontal scroll, shared rails, wheel input, and shift-wheel input MUST stay synchronized when zoom is not Fit, and MUST appear only when zoomed content exceeds that slot — not when spare iframe space remains unused because panes were sized to the baseline CSS box. Fit MUST pin scroll to the origin and MUST NOT offer pan/scroll chrome. Fit MUST measure against the preview iframe viewport split slot (not a collapsed `body`/host box) and MUST resolve to native `100%` when the fitted scale is 1 (subject already fits without shrinking).

Opening split zoom MUST use the persisted user choice when present. Without one, it follows project `previewSplitZoomDefault` (`fit` or `100%`), including when a follow-up INIT replaces built-in defaults after config load. Fit persists as a mode rather than a calculated percentage and recomputes against each current split slot; native `100%` and bounded custom percentages retain their chosen scale. Placement pad activation, story navigation, and remount recovery MUST retain that choice. Reset Settings clears it and immediately returns the active comparison to the project default. The live comparison frame projects the measured Storybook root to the baseline capture width by adding the difference between capture and measured iframe widths. Only the root width is constrained: fixed and max-width subjects retain their natural width, while percentage, flex, grid, and container-width-responsive subjects reflow before the same Fit or `100%` scale is applied to both sides. The current manager iframe still defines the visible split slot.

Fit and `100%` zoom preserve the same pixel coordinate system in baseline and actual panes. Swipe, diff, focus, blink, and two-up result views MUST use an aspect-locked stage.

Baseline and Actual labels are non-layout chrome inside their image frames. The
`Baseline` label MUST use green chrome and the `Actual` label MUST use blue
chrome. In Captured mode with fresh actual evidence, the actual image MUST carry
a visible `Actual` label for every split and centered placement; the centered
label MUST remain visually distinct from the `Baseline` label when both images
share one origin. Configured baseline-label offsets MAY move the Baseline label,
but each label MUST remain clamped to its visible frame and MUST NOT change pane
geometry. Difference blend or inversion affects the baseline overlay only,
never the live story or captured actual.

## Modes

A mode is a named set of Storybook globals. Selecting a mode applies those globals through the manager API and selects its corresponding baseline when one exists.

Disabled modes do not appear as capture targets. A mode without `src` MAY appear as configurable state, but the panel MUST label its baseline coverage as missing.

Returning to Default restores the story’s normal globals and primary baseline target. Mode selection MUST NOT rewrite story configuration.

## Interactions

The panel discovers named `step()` groups and supported top-level Storybook Interactions calls. It initially shows wired interaction baselines and MAY reveal unwired discoveries through **Show all**.

Selecting an interaction remounts and replays the story to the exact capture point. The preview parks play until selection changes or clears. A named step and an ordinary instrumenter call use the same interaction ID marker and exact-generation readiness handshake, including when Storybook’s debugger does not emit `storyFinished` for paused play. Geometry measurement and overlay attachment remain queued until that handshake completes. The panel MUST clear stale park state on story change and MUST recover it across an expected manager remount.

Create interaction baseline uses the discovered label and stable ID. Ordinary instrumenter calls use deterministic IDs that can reconstruct the exact call target.

When the interaction filter exposes more rows than fit in the available addon
panel height, the baseline list is the vertical scroll owner. Real wheel,
trackpad, keyboard, and scrollbar input MUST reach every discovered or wired
interaction without moving or clipping the fixed panel status surface.
An expanded row body retains at least 400 CSS pixels of inspection space. The
list ends with a non-interactive scroll runway equal to half the live panel
height so even the last interaction can move away from the fixed footer.

## Comparison views

Diff HTML captures the live preview in the manager browser. It restores iframe size, scroll positions, focus, temporary capture styles, and preview state even when capture fails.

Diff Browser requests an exact-story `visual-delta test --story-id` comparison for the selected configured browser through the resolved canonical capture runner. It uses the same packaged suite, static Storybook inputs, thresholds, modes or interaction target, and browser configuration as the equivalent command-line request. Diff Result reads the matching runner-produced result, actual PNG, and diff PNG from `/visual-delta-artifacts` only after their capture profile matches the runner result.

The successful Diff Browser terminal sidecar is independently sufficient for
the Capture diagnostics disclosure. The panel derives its requested viewport,
device scale factor, and captured bitmap dimensions directly from that result;
artifact image fetches only control whether the pixel comparison viewer can be
hydrated.

While Diff Browser or a scoped visual run is running, the bottom status surface
shows the latest meaningful runner output, exposes the accumulated live log in
its popover, and exposes Stop without requiring the popover to open. Preview
failure does not hide that cancellation action. Coarse phase labels remain
available when the worker has not emitted a log.

The panel MUST show:

- Engine and authority
- Freshness
- Outcome and runner status
- Difference percentage and threshold
- Dimensions and viewport
- Geometry or alignment warnings
- Changed bounds and histogram when available
- Capture or backend error without replacing the last trustworthy baseline

The compare viewer provides 2-up, Swipe, Diff, Focus, and Blink presentations with shared Fit, custom, and native `100%` zoom. Numeric shortcuts `1`, `2`, and `3` select the primary compare modes; `F` selects Focus, `B` selects Blink, and left or right arrows nudge Swipe. Keyboard input MUST NOT activate while focus is in an editable control.

## Review and Testing Module state

Review controls set exactly one of pending, ready, approved, or failed. Skip eligibility is independent and removes review tags only according to the mutation contract.

The Storybook Testing Module presents compare, create or update baselines, result-to-status update, and affected-only choices. Its preferences do not change panel review controls.

Development sidebar Visual Delta filters MAY include or exclude facet values.
Excluded tokens use a `!` prefix in the `visualFilter` query param (for
example `review.ready,!result.passed`). Includes within a scalar group use OR;
excludes within a group remove matching values; groups combine with AND.
Browser filters inspect present primary-baseline coverage and expose friendly
browser labels. OS filters are obsolete because the canonical profile owns OS
and architecture provenance. Inclusion
exposes only `inclusion.skipped` (include = skipped stories; exclude = hide
skipped). Quick views are include-only, including `Browser coverage gaps` for
included stories whose configured browser coverage is incomplete. The filter menu MUST show
per-option story counts and, when any filter is active, the number of matching
story leaves.

Review layout MAY expand the preview and panel for inspection. Desktop review
uses the full-width bottom dock. Below Storybook's 600 CSS pixel breakpoint,
review uses the native addon drawer and selects Visual Delta before opening it.
Disabling review MUST restore the drawer's prior open or closed state as well as
the prior Storybook layout. The prior layout MUST also be restored when the
addon unmounts.

## Persistence and reload behavior

Local storage MAY retain presentation preferences and Testing Module checkboxes. Overlay visibility and split zoom are origin-scoped preferences rather than story state. Existing settings without a zoom preference continue to use the project default. Automatic manager seeding MAY provisionally hydrate gallery and image metadata, but it MUST use the same image normalization and project/story precedence as preview INIT and MUST NOT persist derived visibility, placement, or zoom. A successful baseline Create or Update MAY temporarily reveal the new result for the current review without changing a stored hidden preference. Session storage MAY retain a park target, selected interaction source, and run reconnect identity.

Preview render generations use a timestamp seed after a full refresh and increase monotonically within an iframe. Older readiness messages MUST NOT replace newer generation state.

After manager hot-module replacement, the panel requests current preview state and middleware run status. After preview hot-module replacement, `overlay-listener-ready` causes the manager to replay the selected image.

Baseline-write progress identifies its exact story scope. When navigation leaves that scope, the new story MUST render from its own readiness and baseline availability only. Completion of the prior write MUST NOT insert a convention-derived image, clear diagnostics, or change the review presentation for the newly active story.

All channel handlers, DOM nodes, styles, resize observers, and scroll listeners MUST be removed when their owning surface becomes inactive. Docs mode MUST never retain a Visual Delta overlay.

Related contracts: [Interfaces](./interfaces.md), [Capture and comparison](./capture-and-comparison.md), [Mutations and review](./mutations-and-review.md), and [Verification](./verification.md).
