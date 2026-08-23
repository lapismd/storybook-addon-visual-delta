# Visual Delta architecture

This reference defines process boundaries, ownership, data flow, lifecycle, and failure isolation for Visual Delta. It separates presentation, rendering, orchestration, capture, artifacts, and repository operations.

## Component boundaries

Each component owns a bounded part of the system:

| Component               | Owns                                                                                                 | Must not own                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Storybook manager       | Panel, Testing Module, toolbar status, action intent, progress presentation                          | Direct filesystem writes, screenshot capture, repository commands         |
| Storybook preview       | Story decorators, render readiness, capture metadata, overlay and split layout, interaction parking  | Baseline mutation, static-build decisions, repository state               |
| Dev middleware          | Request validation, exact scope, process coordination, change tracking, static-build policy, run hub | Product rendering, pixel algorithms, unapproved baseline writes           |
| CLI and host writers    | Approved baseline capture, wiring changes, skip and include source edits, scaffolding                | Presentation state, implicit scope expansion                              |
| Capture runner          | Transport a frozen capture manifest into the canonical Linux/ARM64 profile and return checksummed derived evidence | Scope expansion, comparison policy, direct unapproved repository writes   |
| Playwright suite        | Deterministic configured-browser capture, pixel comparison, staged artifacts, sidecar evidence        | Review approval policy, repository commits                                |
| Artifact store          | Baseline PNGs, local sidecars, affected cache, static Storybook                                      | Business logic or inferred review state                                   |
| Version-control adapter | Read-only history and guarded local commits                                                          | Push, amend, squash, branch creation, discard, remote mutation            |
| Host repository         | Port policy, snapshot layout, custom writers, script gates, package registration                     | Redefining portable package behavior without a host-profile specification |

## Normative requirements

These requirements preserve ownership and trustworthy state across process boundaries.

| ID          | Requirement                                                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-ARCH-001 | The manager, preview, middleware, CLI, capture-runner, Playwright, artifact, and version-control boundaries MUST remain explicit. A component MUST delegate work outside its boundary through a documented interface. The built-in runner MUST stage and invoke the package worker that created the frozen job; it MUST NOT depend on the consumer workspace exposing a `visual-delta` script, `.bin` entry, or resolvable local-link target inside the capture container. Executing an exported source entry from a packed dependency MUST use that package's shipped worker and MUST NOT be mistaken for a buildable source checkout. A buildable source checkout MUST locate its installed TypeScript compiler through the package manifest rather than requiring an unexported package subpath. Every newly staged consumer workspace MUST materialize its workspace-local dependency links before capture even when a content-addressed dependency volume is warm; a warm marker MAY select an offline frozen install but MUST NOT skip that relinking install. When the consumer intentionally installs the initiating package through an external `link:` dependency, the runner MUST stage a disposable writable copy of the current package source, lockfile, workspace configuration when present, and a container-owned dependency environment at the exact in-container link target without mounting or depending on host `node_modules`; the linked source content MUST participate in canonical static-build identity so source edits cannot restore stale output. An explicitly configured baseline directory outside the repository root MUST be copied into an isolated staged input and remapped into the capture workspace; nested symbolic links MUST be materialized as regular files and directories so no host-only link target enters the container. The input MUST NOT broaden the staged source root or become a returned artifact. |
| VD-ARCH-002 | Authoritative visual data MUST originate from a settled preview captured through a configured browser in the canonical Linux/ARM64 capture profile. A later comparison MAY reuse that raw actual PNG without relaunching a browser only when its exact target, render-input fingerprint, capture configuration, capture profile, dimensions, and checksum remain current; the result MUST identify cached-actual reuse and preserve the original capture provenance. Presentation state MUST NOT substitute for capture evidence. |
| VD-ARCH-003 | A story lifecycle MUST distinguish unknown, rendering, ready, running, complete, cancelled, and failed states where applicable. Actions that need a ready render MUST stay disabled while readiness is unknown or rendering. |
| VD-ARCH-004 | Baseline PNGs and story configuration are durable inputs. Derived actual, diff, result, static-output, run, and affected-cache evidence MUST live outside `snapshotDir`, be safe to regenerate, and never be mistaken for a committed baseline. |
| VD-ARCH-005 | Failure in one boundary MUST produce a typed or structured failure at its caller. It MUST NOT silently mutate another boundary, broaden scope, or report success.                                                            |
| VD-ARCH-006 | Deno 2.9.5 MUST own dependency installation, the repository task graph, first-party test and automation entry points, and the root lockfile. Root dependencies MUST use manually installed isolated `node_modules` with a reviewed lifecycle-script allowlist. Compatible npm tooling MAY run through Deno, and established npm exports plus the explicit Node and Playwright adapters MUST remain supported. No other package-manager or task-graph orchestration may remain active. Colocated LapisMD packages MUST be declared, validated, built source-first, and synchronized without rewriting tracked source or publishing local paths. |

## End-to-end data flow

The normal comparison flow has one authoritative path:

```mermaid
sequenceDiagram
  participant M as Manager
  participant P as Preview
  participant N as Middleware
  participant R as Capture runner
  participant B as Playwright worker
  participant A as Artifacts
  M->>P: Select story and baseline
  P-->>M: Exact render ready and measured layout
  M->>N: Compare exact story and variant
  N->>R: Frozen manifest and resolved profile
  R->>B: Execute package worker
  B->>P: Load iframe and wait for readiness
  B->>A: Read expected PNG
  B->>A: Write result sidecar and diagnostic images
  B-->>R: Structured outcome and staged artifacts
  R-->>N: Streamed progress and terminal result
  N-->>M: Progress and final result
```

The built-in runner transports an immutable staged copy of the initiating
package worker into the capture container. Workspace installation remains
responsible for the consumer's Storybook and project dependencies, but worker
selection does not resolve through the staged workspace's scripts,
`node_modules/.bin`, or local-link topology. Source-checkout development builds
the worker before staging it only when the executing module and package-local
build configuration both identify a buildable checkout. It resolves the
installed compiler from TypeScript's exported package manifest, so package
export restrictions on the `bin/tsc` subpath do not masquerade as a missing
compiler. Published consumers use the package's shipped worker even when
Storybook executes an exported file under the tarball's included `src/` tree.
Each fresh consumer staging directory runs a frozen install so Deno recreates
package-local links omitted from the staged copy. A completed dependency-volume
marker changes that install to offline mode; it never suppresses the install.
When the consumer's package manifest explicitly links the initiating Visual
Delta source checkout from outside the workspace, the runner copies the current
source, built output, lockfile, and workspace configuration into disposable
writable staging, mounts it at the
link's resolved container path, and supplies a separate container dependency
volume. The writable copy lets Deno set executable package bins without
mutating the host checkout. This keeps linked development live without importing
host-platform `node_modules` into the canonical Linux profile.
The runner also records a content-only fingerprint of the linked package
manifest, lockfile, and source beneath the staged workspace's isolated capture
inputs. That fingerprint enters the normal canonical build key without exposing
the host path, so a linked source edit invalidates stale static output.
Root-contained absolute snapshot and affected-cache arguments are remapped to
their equivalent `/workspace` paths before the Docker worker is invoked. An
explicit external `snapshotDir` is recursively dereferenced into the isolated
`.visual-delta/capture-inputs/snapshot-dir` staging path so linked baseline
trees become self-contained regular files and directories without transporting
their parent repository. Cyclic links are rejected. That input is excluded from
post-run artifact inventory. An affected-cache path
outside the frozen workspace remains invalid.

Baseline mutation adds a write gate before Playwright starts and an invalidation step after the requested files are written. Repository automation occurs after the mutation succeeds and cannot affect capture semantics.

Compare-only artifact return is a narrow exception to the otherwise read-only
host workspace boundary. The runner may stage only result sidecars, their
`.actual.png` / `.diff.png` diagnostics, and the two package-owned affected
planning JSON files. The host copies them back only after traversal checks,
regular-file checks, checksums, capture-profile validation for sidecars, and
exact cache-path allow-listing. Baseline PNGs, sources, configuration, static
output, and unrelated caches are never valid compare-only return artifacts.
Known and project-configured workspace build-cache roots are excluded from both
staging and the post-run candidate inventory; an explicit runner result that
names one remains forbidden.

## Lifecycle ownership

The preview owns one render generation per selected story. It marks the generation ready only after Storybook emits the exact completion event and layout measurements settle. A Storybook navigation, force remount, hot-module replacement, or server restart invalidates the previous generation.

Middleware owns one run job and one frozen scope. The manager MAY unmount and reconnect to that job through the run hub. Cancellation changes the job state but does not convert incomplete stories into passing or failed comparisons.

## Failure isolation

Every boundary MUST preserve the last trustworthy state:

- A missing baseline reports missing coverage and does not infer a visual mismatch
- A failed capture reports an error and does not reuse an older actual image as current
- A stale sidecar remains visible only as stale evidence and does not establish a current result
- A partial static build is rejected and does not count as a runnable build
- A source-write conflict blocks the mutation or commit and preserves pre-existing edits
- A lost manager connection does not terminate a middleware-owned run

Related contracts: [Interfaces](./interfaces.md), [Capture and comparison](./capture-and-comparison.md), [Test runs and scopes](./test-runs-and-scopes.md), and [VCS and history](./vcs-and-history.md).
