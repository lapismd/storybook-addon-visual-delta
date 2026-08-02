# Visual Delta test runs and scopes

This reference defines story selection, frozen action scopes, action ordering, static-build readiness, affected planning, progress, reconnection, cancellation, and compare-only safety.

## Normative requirements

These requirements keep every run conservative, reconnectable, and compare-only unless a writer is selected.

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-RUN-001 | Every invocation MUST resolve one exact, de-duplicated set of story IDs before its first action. Later sidebar, filter, graph, or preference changes MUST NOT alter that frozen scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| VD-RUN-002 | Story, component, global, and affected contexts MUST use their defined scope. An empty result MUST report empty and MUST NOT broaden to siblings or the complete suite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| VD-RUN-003 | Enabled Testing Module actions MUST run in this order: baseline writes, visual comparisons, result-to-review Update status, then optional Run Diff Accept of last-run passes when project auto-accept is enabled. **Run Diff** and **Run visual tests** MUST share one configured-browser compare per Play (deduped). A failed earlier action MUST prevent unsafe dependent actions.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| VD-RUN-004 | Static Playwright MUST run only against a complete, current, and trustworthy static Storybook. Missing or invalid `index.json`, `iframe.html`, graph, or cache evidence, or newer selected story, transitive preview, or static configuration input MUST trigger rebuild or conservative fallback. A capture-runner workspace that intentionally excludes host `storybook-static` MUST build it before every exact, affected, or all comparison instead of assuming the host tree was transported. Primary and interaction writers MUST apply the same freshness decision.                                                                                                                                                                                                                                                                                                                                                  |
| VD-RUN-005 | Affected selection MUST choose all eligible stories when dependency tracing is incomplete or a global-risk input changes. Passing cache entries MAY reduce scope only with matching fingerprints. The built-in runner MUST transport the package-owned affected cache and preview-graph inputs needed to make that same conservative decision inside its staged workspace; it MUST NOT silently turn every `--affected` command into a full run merely because unrelated caches are excluded from staging.                                                                                                                                                                                                                                                                                                                                                                                     |
| VD-RUN-006 | Every run MUST have a stable job ID, reconnectable progress, one terminal state, and cooperative cancellation. Run and baseline-write progress MUST identify its frozen target scope, and terminal effects MUST NOT follow navigation outside that scope. Compare runs MUST force snapshot updates off. Cancellation MUST transition the hub and manager presentation (run progress, baseline-write progress, in-flight result-to-review presentation, and the Testing Module provider running state) to a terminal cancelled or idle/pending state even when no child process is alive. Abort MUST cancel in-flight manager NDJSON fetches so `runWithState` can finish. After remount, when the hub is idle and no writer or status job is active, the manager MUST NOT leave Testing Module controls in a running state. |
| VD-RUN-007 | Every authoritative comparison initiated by the CLI, Diff Browser, panel, or Testing Module MUST execute through the resolved canonical capture runner and the packaged `visual-delta test` worker; middleware MUST NOT invoke a separate host-local Playwright command. An exact story list MUST remain an exact worker selection and MUST NOT broaden to all stories. A full or global run MUST execute every configured browser; an explicit browser selection narrows only to configured browsers. Results and progress MUST retain the runner's actual per-browser target and capture-profile provenance while story summaries aggregate all required browsers. A story is reusable passing evidence only when every selected browser passes. Warning outcomes MUST NOT enter the passing affected cache or become auto-accept candidates. |

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
2. **Run visual tests** and/or **Run Diff** (one configured-browser matrix compare when either is selected)
3. Update review status from the complete result set (`visual-ready` / `visual-failed`)
4. When **Run Diff** is selected and `workflow.autoAcceptLiveStoryComparisons` is enabled, Accept last-run stories whose outcome is `passed` or `changed-within-tolerance` (`visual-approved`)

Result-to-review updates require evidence for every story in the frozen scope. Partial or stale manager results MUST NOT update the subset that happens to remain in memory. Pass and within-tolerance outcomes MUST NOT overwrite `visual-approved` with `visual-ready` (see [Mutations and review](./mutations-and-review.md)).

Run Diff Accept uses the same Accept current-run eligibility as the panel (`acceptableStoryIdsFromLastRun`). Missing baselines, skips, and infrastructure failures MUST NOT be approved. When auto-accept is off, Run Diff still compares but MUST NOT change review tags beyond an enabled Update status step.

Create-missing MAY continue wiring successfully created PNGs if unrelated existing baselines fail comparison. It MUST report the non-zero comparison separately.

## Static Storybook readiness

A static tree is complete only when both `storybook-static/index.json` and `storybook-static/iframe.html` exist and parse or serve as required. A healthy `index.json` alone is insufficient.

Middleware MAY reuse a static tree when:

- Both required files exist
- The selected story sources and known transitive preview modules are not newer than the static index
- Static Storybook and Visual Delta configuration inputs are not newer than the static index
- The requested source graph and affected cache are trustworthy
- The action does not explicitly require a rebuild
- The host permits reuse for that action

Affected changes that need a fresh graph trigger a build before capture. Interaction creation and update MUST use the same package-owned static freshness decision as primary writers; the existence of a complete but stale tree is not sufficient. Manual rebuild creates static output only and does not capture, compare, mutate review status, or write baselines.

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

`visual-delta test --all`, `visual-delta test --affected`, `visual-delta test --story-id`, panel **Run**, Diff Browser, and Testing Module comparisons MUST set `PLAYWRIGHT_UPDATE_SNAPSHOTS=0`. They MUST NOT invoke update scripts or create missing snapshots. The capture runner MAY return only generated comparison sidecars, `.actual.png` / `.diff.png` diagnostics, and the exact package-owned `affected-state-v1.json` / `preview-stats.json` planning files for compare-only jobs; the host MUST checksum, validate, and copy only those allow-listed derived artifacts. A compare-only job MUST reject baseline PNGs, source files, configuration, static output, unrelated caches, or any other staged mutation. Compare actions MUST NOT change review tags unless Update status is enabled, or Testing Module **Run Diff** is enabled with project auto-accept for last-run passes.

Story and Diff Browser actions compare one exact target through the same suite and runner as the corresponding command-line exact-story request. Scoped static runs compare every target registered by the host suite for each frozen story and enabled browser.

## Progress, reconnection, and cancellation

Middleware owns the running child process and publishes newline-delimited JSON progress. The manager stores only the job identity and presentation state.

Story-targeted baseline writes publish their exact story IDs with every progress and terminal update. The panel presents a write only while the active story belongs to that scope. Navigating elsewhere does not cancel the writer, but it detaches the new story from the old progress and completion effects.

After remount, the manager:

1. Reads `/run-status`
2. Replays `/run-events`
3. Subscribes to continuation events
4. Avoids a second `/run-tests` request for the same job

Cancellation sends one abort request and transitions the job to cancelling, then cancelled when the child exits. Middleware MUST publish a terminal cancelled event before resetting the hub so reconnecting clients clear progress. The manager abort path MUST clear run progress, baseline-write progress, and any in-flight result-to-review presentation job even when no child process is alive. It MUST also abort in-flight run/reconnect/action-scope NDJSON fetches and reset the Testing Module provider out of `running` so Stop is effective when the hub is already idle. Completed results remain available, while unexecuted stories remain without a new outcome.

After remount, the manager MUST clear orphan presentation progress when `/run-status` reports idle and no baseline writer is active. When the hub is idle, no writer is active, and no status job is pending, it MUST also clear an orphan Testing Module `running` provider state. It MUST NOT leave Testing Module or panel controls in a running state solely because in-memory progress or a hung `runWithState` survived a prior hot reload.

If a child process exits without a structured terminal event, middleware MUST synthesize an error terminal state. Reconnection failure MAY expose a retry action, but it MUST NOT label the prior run as passing.

Related contracts: [Architecture](./architecture.md), [Interfaces](./interfaces.md), [Capture and comparison](./capture-and-comparison.md), and [Verification](./verification.md).
