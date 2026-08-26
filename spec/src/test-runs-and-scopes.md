# Visual Delta test runs and scopes

This reference defines story selection, frozen action scopes, action ordering, static-build readiness, affected planning, progress, reconnection, cancellation, and compare-only safety.

## Normative requirements

These requirements keep every run conservative, reconnectable, and compare-only unless a writer is selected.

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-RUN-001 | Every invocation MUST resolve one exact, de-duplicated set of story IDs before its first action. Later sidebar, filter, graph, or preference changes MUST NOT alter that frozen scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| VD-RUN-002 | Story, component, global, and affected contexts MUST use their defined scope. An empty result MUST report empty and MUST NOT broaden to siblings or the complete suite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| VD-RUN-003 | Enabled Testing Module actions MUST run in this order: baseline writes, visual comparisons, result-to-review Update status, then optional Run Diff Accept of last-run passes when project auto-accept is enabled. **Run Diff** and **Run visual tests** MUST share one configured-browser compare per Play (deduped). A failed earlier action MUST prevent unsafe dependent actions.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| VD-RUN-004 | Static Playwright MUST run only against a complete, current, and trustworthy static Storybook. Missing or invalid `index.json`, `iframe.html`, graph, or cache evidence, or a changed selected story, transitive preview, package, lock, static configuration, canonical profile, or configured external input MUST trigger rebuild or conservative fallback. Static-server health probes MUST use bodyless requests for both required documents so readiness checks do not retain unread response streams. Every static build used by an authoritative comparison MUST emit the current Vite preview dependency graph into the configured affected cache (`.visual-delta/cache/preview-stats.json` by default), including the package self-host build and generated consumer scaffold. The built-in capture runner MAY restore a checksum-verified canonical static build and matching graph from `.visual-delta/cache/canonical-build`; it MUST reuse only a complete atomic entry whose logical input fingerprint and capture profile match, MUST preserve the Linux build cache with that entry, and MUST rebuild on partial, corrupt, stale, or forced-rebuild evidence. Primary and interaction writers MUST restore and publish through this same canonical decision before consulting an incomplete staged static tree. One action MUST NOT perform a host static rebuild and then repeat the same canonical rebuild in Docker. Superseded complete canonical entries MUST be pruned to a bounded retention set without removing the active entry or Linux build cache. |
| VD-RUN-005 | Affected selection MUST be enabled when `affectedTests` is omitted and MUST choose all eligible stories when dependency tracing is incomplete or a global-risk input changes; `affectedTests: false` is the explicit opt-out. Passing cache entries MAY reduce scope only with matching fingerprints. Exact story or component planning MUST hash each unique input at most once in a snapshot and MUST calculate only the requested scope instead of reporting every runnable story as affected. A manager-selected run MUST let the packaged worker calculate that exact plan once; manager validation and ordinary visible-scope resolution MUST use the static index and MUST NOT precede the worker with another graph traversal. The worker-owned affected-cache result returned by the capture runner MUST NOT be recomputed by the manager after capture. When a live global affected scope needs refreshed static or graph evidence, the manager MUST freeze the visible eligible scope conservatively and let the canonical runner perform the single required rebuild; it MUST NOT perform a host rebuild first. Affected cache version 3 MUST use logical project and snapshot-relative identities, MUST omit physical host, external-stage, Docker workspace, cache, and snapshot locations from semantic fingerprints, and MUST avoid repeated per-story dependency arrays. A version 2 pass MAY migrate only after current render and baseline evidence revalidates it; a scoped migration MUST discard passes outside that revalidated scope, and otherwise planning MUST retain the conservative full fallback. The built-in runner MUST transport `affected-state-v1.json` and `preview-stats.json` needed to make the same conservative decision inside its staged workspace. |
| VD-RUN-006 | Every run MUST have a stable job ID, reconnectable progress, one terminal state, and cooperative cancellation. Run and baseline-write progress MUST identify its frozen target scope, and terminal effects MUST NOT follow navigation outside that scope. Compare runs MUST force snapshot updates off. Cancellation MUST transition the hub and manager presentation (run progress, baseline-write progress, in-flight result-to-review presentation, and the Testing Module provider running state) to a terminal cancelled or idle/pending state even when no child process is alive. Abort MUST cancel in-flight manager NDJSON fetches so `runWithState` can finish. Every manager surface that presents an active run, including the persistent panel footer, MUST expose Stop independently of preview readiness or render failure. While an in-memory presentation remains running, the manager MUST reconcile it with `/run-status` after remount, on focus or visibility recovery, and periodically until terminal; `done` or `idle` with no child, writer, or status job MUST clear orphan run progress and the Testing Module provider running state. |
| VD-RUN-007 | Every authoritative comparison initiated by the CLI, Diff Browser, panel, or Testing Module MUST execute through the resolved canonical capture runner and packaged `visual-delta test` worker; middleware MUST NOT invoke a separate host-local Playwright command. The worker MUST pass the resolved snapshot directory and baseline path mode into the portable Playwright suite. An explicit exact-baseline override MUST capture and compare only that selected variant; it MUST NOT consult Playwright's generated snapshot filename or implicitly add named modes. With reuse enabled, that worker MUST attempt checksum-verified actual reuse before a static build or browser launch and MAY reuse only a canonical actual whose render fingerprint, capture settings, profile, exact target, and complete capture set match. Reuse MUST be resolved independently for every selected story and browser target; one stale or missing target MUST NOT recapture another valid target. `--fresh` or an equivalent one-shot UI request MUST bypass actual reuse and force browser capture while still permitting a verified canonical static-build cache; `--rebuild` MUST force a new canonical Storybook build. An exact story list MUST remain exact. Expected strict-policy outcomes, including a visual mismatch or missing baseline, MUST be collected through the selected scope without restarting the Playwright worker after each story; the final non-zero exit MUST derive from the complete sidecar set, while infrastructure, readiness, browser, or artifact failures MAY stop immediately. Primary and mode sidecars MUST be aggregated so any failed required target prevents a passing story summary or passing affected-cache entry. A full or global run MUST cover every configured browser; an explicit browser selection narrows only to configured browsers. Results and progress MUST retain the target, capture profile, and browser-versus-cache provenance while summaries aggregate all required browsers. Warning outcomes MUST NOT enter the passing affected cache or become auto-accept candidates. The built-in Docker runner MUST key its dependency installation by the lockfile, workspace manifests, package manifests, and canonical profile, MUST reuse a verified installation for an unchanged key, and MUST execute installation when required and the packaged worker in one cancellable container transaction. |

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

A static tree is complete only when both `storybook-static/index.json` and `storybook-static/iframe.html` exist and parse or serve as required. A healthy `index.json` alone is insufficient. Live server probes use `HEAD` for both documents: status is readiness evidence while a response body is neither required nor retained.

Middleware MAY reuse a static tree when:

- Both required files exist
- The selected story sources and known transitive preview modules are not newer than the static index
- Static Storybook and Visual Delta configuration inputs are not newer than the static index
- The requested source graph and affected cache are trustworthy
- The action does not explicitly require a rebuild
- The host permits reuse for that action

The built-in runner MAY satisfy the same readiness contract by restoring a
canonical build-cache entry created by the Linux/ARM64 workspace. The entry
contains a complete `storybook-static`, its matching `preview-stats.json`, and
Linux build-cache state. It is addressed by logical project inputs and the
canonical capture profile, not the host or container filesystem location, and
is published atomically only after all required evidence validates. `--fresh`
bypasses captured-actual reuse but does not invalidate this build cache;
`--rebuild` bypasses it. The active entry and at most one previous complete
entry are retained; publishing a third complete fingerprint prunes the oldest
superseded entry while leaving the shared Linux build cache intact.

Affected changes that need a fresh graph trigger one canonical build before
capture. A live manager that cannot trust its host graph freezes all visible
eligible stories and delegates that refresh to the capture runner instead of
building host static output first. The canonical build command writes
`preview-stats.json` into the configured affected-cache directory so the same
graph can produce render fingerprints for actual-image reuse and panel
hydration. Interaction creation and update use the same package-owned static
freshness decision as primary writers; the existence of a complete but stale
tree is not sufficient. Manual rebuild creates static output and graph evidence
only; it does not capture, compare, mutate review status, or write baselines.

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

When an affected plan is empty and its cache evidence is trustworthy, the CLI
MUST return successfully before starting the capture runner. Omitted
`affectedTests` host configuration uses this safe affected selection; hosts
that require an unconditional global scope MUST opt out explicitly with
`affectedTests: false`.

## Compare-only execution

`visual-delta test --all`, `visual-delta test --affected`, `visual-delta test --story-id`, panel **Run**, Diff Browser, and Testing Module comparisons MUST set `PLAYWRIGHT_UPDATE_SNAPSHOTS=0`. They MUST NOT invoke update scripts or create missing snapshots. The capture runner MAY return only validated `.visual-delta/artifacts/**/*.result.json`, matching raw actual/diff PNGs, and the exact package-owned `.visual-delta/cache/affected-state-v1.json` / `preview-stats.json` files; the host MUST checksum, validate, and copy only those allow-listed artifacts. A staged external baseline input MUST be excluded from post-run inventory and MUST NOT be returned to the host. Known derived build-cache roots, including Deno's `.deno`, plus validated project `captureWorkspaceIgnore` directories MUST be excluded from staging and inventory rather than classified as result JSON. A compare-only job MUST reject unrelated caches, legacy colocated companions, baseline PNGs, source, configuration, static output, or any other mutation. Compare actions MUST NOT change review tags unless Update status is enabled, or Testing Module **Run Diff** is enabled with project auto-accept for last-run passes.

Story and Diff Browser actions compare one exact target through the same suite and runner as the corresponding command-line exact-story request. Scoped static runs compare every target registered by the host suite for each frozen story and enabled browser. Expected visual-policy failures are reported after that frozen scope has completed so actual images remain available for review; they remain non-zero in strict mode and warnings in warn mode.

## Progress, reconnection, and cancellation

Middleware owns the running child process and publishes newline-delimited JSON progress. The manager stores only the job identity and presentation state.

Exact-story comparisons publish the capture runner's log chunks in the same
NDJSON response. Diff Browser presents the accumulating log in the panel status
surface while preserving structured phase labels and the terminal result.

Story-targeted baseline writes publish their exact story IDs with every progress and terminal update. The panel presents a write only while the active story belongs to that scope. Navigating elsewhere does not cancel the writer, but it detaches the new story from the old progress and completion effects.

After remount, the manager:

1. Reads `/run-status`
2. Replays `/run-events`
3. Subscribes to continuation events
4. Avoids a second `/run-tests` request for the same job

Cancellation sends one abort request and transitions the job to cancelling, then cancelled when the child exits. Middleware MUST publish a terminal cancelled event before resetting the hub so reconnecting clients clear progress. The manager abort path MUST clear run progress, baseline-write progress, and any in-flight result-to-review presentation job even when no child process is alive. It MUST also abort in-flight run/reconnect/action-scope NDJSON fetches and reset the Testing Module provider out of `running` so Stop is effective when the hub is already idle. Completed results remain available, while unexecuted stories remain without a new outcome.

After remount, and while any manager surface still presents a run, the manager MUST clear orphan presentation progress when `/run-status` reports `done` or `idle` with no active child or baseline writer. When no writer or status job is pending, it MUST also clear an orphan Testing Module `running` provider state. Reconciliation MUST run when focus or visibility returns and at a bounded interval while the presentation remains active, so a missed in-memory terminal event cannot leave the footer or Testing Module running indefinitely. It MUST NOT leave Testing Module or panel controls in a running state solely because in-memory progress or a hung `runWithState` survived a prior hot reload.

If a child process exits without a structured terminal event, middleware MUST synthesize an error terminal state. Reconnection failure MAY expose a retry action, but it MUST NOT label the prior run as passing.

Related contracts: [Architecture](./architecture.md), [Interfaces](./interfaces.md), [Capture and comparison](./capture-and-comparison.md), and [Verification](./verification.md).
