# Visual Delta panel and preview

This reference defines the interactive Storybook surfaces and their shared state. It covers baseline selection, placement, modes, interactions, comparisons, review controls, persistence, hot reload, and teardown.

## Normative requirements

These requirements keep interactive state recoverable and separate from durable system state.

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-UI-001 | The panel MUST present coverage, comparison outcome, review status, skip eligibility, and run state as separate concepts. A control MUST mutate only the concept it names. Panel coverage and preview comparison MUST resolve the same exact selected browser target: a displayed selected-browser baseline MUST NOT be labelled missing or offer Create, and a browser without a matching baseline MUST NOT retain another browser's overlay. When an eligible missing target becomes ready, the panel MUST expose its exact create action when the backend permits writes. Explicitly targeted non-canonical teaching fixtures remain compare-only and MUST NOT expose baseline Create, Update, or Delete actions. |
| VD-UI-002 | The first available baseline MUST auto-select after the active render becomes ready. Soft hide MUST preserve selection, while navigation away from Canvas MUST remove all preview comparison DOM.                                                                                                                                                                                                                                                                                                                    |
| VD-UI-003 | Split placements MUST provide equal live and baseline panes with synchronized two-dimensional navigation. A layout refresh, shared-extent refresh, or split-chrome rebuild for the same active selection MUST reapply the active shared scroll position, clamped only to the resulting common extent, and MUST NOT treat its programmatic scroll events as user navigation. A hard selection clear MAY reset that position. Center placement MUST overlay only the baseline image above the live story. |
| VD-UI-004 | Named modes MUST apply their exact Storybook globals. Interaction rows MUST represent `{ id, label, src }`, support deterministic replay, and distinguish discovered points from wired baselines. Replay MUST publish readiness for the exact parked generation before geometry or comparison work begins. An unwired discovered point MUST expose creation for that exact point when the backend permits writes. The bounded interaction list MUST own vertical overflow so every row and action remains reachable. |
| VD-UI-005 | Diff result views MUST hydrate fresh Playwright sidecars and diagnostic images and present 2-up, Swipe, Diff, Focus, and Blink over one aligned pixel coordinate system. Failed fetches and stale evidence MUST NOT poison current state.                                                                                                                                                                                                                                                                            |
| VD-UI-006 | Manager and preview remounts MUST recover selection and run state through events or middleware. Story-scoped job progress and terminal effects MUST remain bound to the originating story: navigation MUST stop presenting them for another story and MUST NOT hydrate that story. On active storyId change the panel MUST hard-clear the prior story gallery and selection before requesting INIT for the new story. Baseline overlay chrome MUST NOT remain visible for a failed or unloaded baseline image of the active generation. Event listeners and injected DOM MUST be fully torn down when inactive.                                                                                                                                                           |
| VD-UI-007 | Local presentation settings MAY persist in browser storage. Durable configuration, review metadata, coverage, and mutation authorization MUST come from project or source state.                                                                                                                                                                                                                                                                                                                                     |
| VD-UI-008 | In read-only capability mode (static Storybook or host `readOnly`), the panel MUST keep baseline gallery selection, placement, soft hide, opacity, zoom, modes, interaction replay, Diff HTML, and Diff Result hydrate available when data exists. It MUST NOT present enabled Create, Update, Delete, skip/include mutation, Accept, Diff Browser, Story official compare, Run visual, Rebuild static, Configuration save, Changes/VCS, Init scaffold, or baseline history actions. Empty states MUST NOT offer Create visual or Set up Visual Delta; they MUST explain that baselines are wired through story parameters or require a development host. |
| VD-UI-009 | The panel MUST expose one joined Profile × Browser control with a read-only canonical-profile indicator on the left and the browser selector on the right, each with a recognizable icon. The profile indicator MUST present Linux/ARM64 and expose detailed provenance in its accessible tooltip. Chromium is the initial browser; the option set combines configured and canonically discovered browsers. Disabled discovered browsers remain view-only. Selection MUST resolve exact browser images, history, and sidecars, persist only as presentation state, and never fall back to another browser. |
| VD-UI-010 | The persistent bottom status footer MUST span the full visible Visual Delta panel width in idle, logging, environment-selection, and running states. Its top edge MUST meet the panel's left edge without a rounded top-left corner or an inset left border. |
| VD-UI-011 | Development sidebar filters MUST derive a dynamic Browser facet from story-facts and persist `browser.<id>` include/exclude tokens in `visualFilter`. Multiple browser includes use OR; an excluded browser removes a story carrying that primary baseline. Browser filtering combines with existing groups using AND. `Browser coverage gaps` MUST include only non-skipped story leaves with a missing or unresolved required primary browser. Component folders remain visible when at least one child matches. Static/read-only managers without `/story-facts` MUST NOT advertise project-wide sidebar filtering. |

## Panel structure

The Visual Delta panel contains:

- A header with run, create, update, accept, review-layout, filtering, and configuration entry points
- A baseline gallery and mode selector
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

Soft hide removes overlay or split DOM but retains the selected target and placement. Selecting the same placement again restores it. Hard clear resets comparison state when the story changes, the selected target disappears, or Storybook leaves Canvas mode. When preview reports `overlay-listener-ready` for a different storyId than the panel session, the panel MUST discard the prior gallery, index, and pins before requesting INIT — it MUST NOT keep the previous story’s baseline tag while waiting for the new story.

Baseline image paint requires a `SELECT_IMAGE` with measured `layoutSnapshot` for the active generation. Overlay geometry measurement MUST settle at the manager’s current preview size after the active render is ready; it MUST NOT resize the preview iframe to the Playwright capture viewport (that transaction is reserved for Diff HTML / subject capture). A load failure MUST remove or hide Baseline chrome for that generation rather than leave a chip without a bitmap.

Image-only mode hides the live story and displays the baseline in center placement. Restoring live visibility MUST restore the prior comparison without changing durable state.

## Placement and navigation

The placement pad supports:

| Placement | Presentation                       |
| --------- | ---------------------------------- |
| `left`    | Baseline pane left of live pane    |
| `right`   | Baseline pane right of live pane   |
| `above`   | Baseline pane above live pane      |
| `below`   | Baseline pane below live pane      |
| `center`  | Baseline ghost over the live story |

Split panes use equal frames that fill the preview iframe split slot (half the viewport on the stacked axis). Left/right and above/below placements MUST show a centered dashed separator between the equal panes; center placement MUST NOT. Both panes expose a shared scroll extent based on the larger content. Vertical and horizontal scroll, shared rails, wheel input, and shift-wheel input MUST stay synchronized when zoom is not Fit, and MUST appear only when zoomed content exceeds that slot — not when spare iframe space remains unused because panes were sized to the baseline CSS box. Fit MUST pin scroll to the origin and MUST NOT offer pan/scroll chrome. Fit MUST measure against the preview iframe viewport split slot (not a collapsed `body`/host box) and MUST resolve to native `100%` when the fitted scale is 1 (subject already fits without shrinking).

Opening split zoom MUST follow project `previewSplitZoomDefault` (`fit` or `100%`), including when a follow-up INIT replaces built-in defaults after config load. A user-edited zoom MUST survive later INIT for the same story. Placement pad activation MUST reopen with the project default rather than always forcing Fit.

Fit and `100%` zoom preserve the same pixel coordinate system in baseline and actual panes. Swipe, diff, focus, blink, and two-up result views MUST use an aspect-locked stage.

Baseline and image-only labels are non-layout chrome inside the image frame. Configured label offsets MAY move the label, but the label MUST remain clamped to the visible frame and MUST NOT change pane geometry. Difference blend or inversion affects the baseline overlay only, never the live story.

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

## Comparison views

Diff HTML captures the live preview in the manager browser. It restores iframe size, scroll positions, focus, temporary capture styles, and preview state even when capture fails.

Diff Browser requests an exact-story middleware comparison for the selected configured browser through the canonical capture runner. Diff Result reads the matching sidecar, actual PNG, and diff PNG from `/visual-baselines`.

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

Review layout MAY expand the preview and panel for inspection. It MUST restore the prior Storybook layout when disabled or when the addon unmounts.

## Persistence and reload behavior

Local storage MAY retain presentation preferences and Testing Module checkboxes. Session storage MAY retain a park target, selected interaction source, and run reconnect identity.

Preview render generations use a timestamp seed after a full refresh and increase monotonically within an iframe. Older readiness messages MUST NOT replace newer generation state.

After manager hot-module replacement, the panel requests current preview state and middleware run status. After preview hot-module replacement, `overlay-listener-ready` causes the manager to replay the selected image.

Baseline-write progress identifies its exact story scope. When navigation leaves that scope, the new story MUST render from its own readiness and baseline availability only. Completion of the prior write MUST NOT insert a convention-derived image, clear diagnostics, or change the review presentation for the newly active story.

All channel handlers, DOM nodes, styles, resize observers, and scroll listeners MUST be removed when their owning surface becomes inactive. Docs mode MUST never retain a Visual Delta overlay.

Related contracts: [Interfaces](./interfaces.md), [Capture and comparison](./capture-and-comparison.md), [Mutations and review](./mutations-and-review.md), and [Verification](./verification.md).
