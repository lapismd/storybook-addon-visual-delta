# Visual Delta test runs and scopes

This reference defines story selection, frozen action scopes, action ordering, static-build readiness, affected planning, progress, reconnection, cancellation, and compare-only safety.

## Normative requirements

These requirements keep every run conservative, reconnectable, and compare-only unless a writer is selected.

| ID         | Requirement                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-RUN-001 | Every invocation MUST resolve one exact, de-duplicated set of story IDs before its first action. Later sidebar, filter, graph, or preference changes MUST NOT alter that frozen scope.                                                                                                                  |
| VD-RUN-002 | Story, component, global, and affected contexts MUST use their defined scope. An empty result MUST report empty and MUST NOT broaden to siblings or the complete suite.                                                                                                                                 |
| VD-RUN-003 | Enabled Testing Module actions MUST run in this order: baseline writes, visual comparisons, then result-to-review updates. A failed earlier action MUST prevent unsafe dependent actions.                                                                                                               |
| VD-RUN-004 | Static Playwright MUST run only against a complete and trustworthy static Storybook. Missing or invalid `index.json`, `iframe.html`, graph, or cache evidence MUST trigger rebuild or conservative fallback.                                                                                            |
| VD-RUN-005 | Affected selection MUST choose all eligible stories when dependency tracing is incomplete or a global-risk input changes. Passing cache entries MAY reduce scope only with matching fingerprints.                                                                                                       |
| VD-RUN-006 | Every run MUST have a stable job ID, reconnectable progress, one terminal state, and cooperative cancellation. Run and baseline-write progress MUST identify its frozen target scope, and terminal effects MUST NOT follow navigation outside that scope. Compare runs MUST force snapshot updates off. |

## Scope resolution

Invocation context resolves as:

| Context                   | Base scope                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Story sidebar entry       | Exactly the selected story                                                         |
| Component sidebar entry   | Every descendant story under that component                                        |
| Panel story action        | Exactly the active story, unless the control explicitly offers another named scope |
| Global Testing Module     | Stories currently visible in the filtered sidebar                                  |
| Global with affected-only | Visible stories intersected with the refreshed affected plan                       |

The resolver then intersects the base scope with runnable visual stories. `skip-visual` stories and non-story index entries are not runnable.

The resulting array is detached from manager state. It is de-duplicated while retaining deterministic order for progress and reporting.

## Action sequence

The Testing Module can enable:

1. Create missing or rewrite requested baselines
2. Run compare-only visual tests
3. Update review status from the complete result set

Result-to-review updates require evidence for every story in the frozen scope. Partial or stale manager results MUST NOT update the subset that happens to remain in memory.

Create-missing MAY continue wiring successfully created PNGs if unrelated existing baselines fail comparison. It MUST report the non-zero comparison separately.

## Static Storybook readiness

A static tree is complete only when both `storybook-static/index.json` and `storybook-static/iframe.html` exist and parse or serve as required. A healthy `index.json` alone is insufficient.

Middleware MAY reuse a static tree when:

- Both required files exist
- The requested source graph and affected cache are trustworthy
- The action does not explicitly require a rebuild
- The host permits reuse for that action

Affected changes that need a fresh graph trigger a build before capture. Manual rebuild creates static output only and does not capture, compare, mutate review status, or write baselines.

## Affected selection

Affected planning uses:

- Storybook `preview-stats.json`
- Static `index.json`
- Story import paths and reverse dependencies
- Current file hashes
- A configuration fingerprint
- Per-story passing fingerprints
- Configured external and untraced globs

The planner selects all eligible stories when:

- Graph, index, or cache data is missing, stale, malformed, or unsupported
- Storybook configuration or preview infrastructure changes
- Playwright or Visual Delta capture infrastructure changes
- Package metadata, lockfiles, or configured static assets change
- A configured external changes
- A dependency reaches global preview state
- A story cannot be traced with high confidence

`untraced` globs suppress dependency evidence and reduce coverage. Their use MUST be explicit and visible in the plan explanation.

A full passing run seeds current fingerprints. Only successfully exercised stories advance their passing fingerprint.

## Compare-only execution

`visual-delta test --all`, `visual-delta test --affected`, panel **Run**, and Testing Module comparisons MUST set `PLAYWRIGHT_UPDATE_SNAPSHOTS=0`. They MUST NOT invoke update scripts, create missing snapshots, or change review tags unless the separate result-to-review action is enabled.

Story and Diff Chromium actions compare one exact target. Scoped static runs compare every target registered by the host suite for each frozen story.

## Progress, reconnection, and cancellation

Middleware owns the running child process and publishes newline-delimited JSON progress. The manager stores only the job identity and presentation state.

Story-targeted baseline writes publish their exact story IDs with every progress and terminal update. The panel presents a write only while the active story belongs to that scope. Navigating elsewhere does not cancel the writer, but it detaches the new story from the old progress and completion effects.

After remount, the manager:

1. Reads `/run-status`
2. Replays `/run-events`
3. Subscribes to continuation events
4. Avoids a second `/run-tests` request for the same job

Cancellation sends one abort request and transitions the job to cancelling, then cancelled when the child exits. Completed results remain available, while unexecuted stories remain without a new outcome.

If a child process exits without a structured terminal event, middleware MUST synthesize an error terminal state. Reconnection failure MAY expose a retry action, but it MUST NOT label the prior run as passing.

Related contracts: [Architecture](./architecture.md), [Interfaces](./interfaces.md), [Capture and comparison](./capture-and-comparison.md), and [Verification](./verification.md).
