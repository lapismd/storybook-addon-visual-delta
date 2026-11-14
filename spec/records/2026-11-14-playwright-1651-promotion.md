# Playwright 1.65.1 image promotion

Publication workflow 43560743507 completed all four jobs successfully:
immutable multiarchitecture publication, native x64 smoke, native ARM64 smoke
and capture-profile assembly. Approval used the GitHub CLI. Source is
`631e82c3c6eb96f25c40a4a5d2fea47952c6dd96`, frozen lock SHA256
`87944d75784e634a35084f8d9e45389dcb9cec8f10d7069836976c57eef044f6`.
Unique tag: `node24.15.0-pnpm10.32.1-playwright1.65.1-20261114-r1`.

The retained profile below is the workflow artifact, not inferred browser data.
Before promotion, exact `pnpm ci:image:check` reports two findings requiring
Playwright and @playwright/test 1.65.0. Promotion updates both package/profile
guards and their negative mutation fixtures without changing assertions.
All compare-only package, panel, manager and three-browser gates remain required.
Committed visual baselines remain unchanged. No advisory exception is added.

```json
{
  "sourceRevision": "631e82c3c6eb96f25c40a4a5d2fea47952c6dd96",
  "lockSha256": "87944d75784e634a35084f8d9e45389dcb9cec8f10d7069836976c57eef044f6",
  "schemaVersion": 1,
  "id": "visual-delta-linux-arm64-v1",
  "os": "linux",
  "architecture": "arm64",
  "image": "ghcr.io/lapismd/storybook-addon-visual-delta-ci",
  "imageDigest": "sha256:07accec7a558224cf39ab8ea0d8e65cbee53837be1122cc9d6420cb12d637161",
  "arm64ImageDigest": "sha256:c45eaf81d375fcbf4fd275df6029d776c3bb452aba0e0be3188eaebf1b9201bd",
  "nodeVersion": "24.15.0",
  "npmVersion": "12.0.2",
  "pnpmVersion": "10.32.1",
  "playwrightVersion": "1.65.1",
  "browsers": [
    "chromium",
    "firefox",
    "webkit"
  ],
  "browserVersions": {
    "chromium": "159.0.8154.6",
    "firefox": "159.0",
    "webkit": "27.2"
  },
  "locale": "en-GB",
  "timezoneId": "Europe/London",
  "colorScheme": "light",
  "reducedMotion": "reduce",
  "viewport": {
    "width": 1280,
    "height": 900
  },
  "deviceScaleFactor": 1,
  "rendering": {
    "animations": "disabled",
    "caret": "hide",
    "screenshotScale": "device"
  },
  "fontManifestSha256": "sha256:be624be721eecdf535a480ca7e0382cd6510f8060b849f604eb55144ed1c83d3"
}
```


## Qualification

- Exact `pnpm ci:image:check`: two findings before promotion, zero afterward.
- Pinned Node 24.15.0 / pnpm 10.32.1: typechecks and all 619 unit cases pass.
- Full specification check: all seven lanes pass, including strict image
  guards, their negative fixtures, architecture and spec-first checks.
- Node build and publint pass; the cold panel lane also rebuilt static Storybook.
- Verified image on native Linux/x64: panel 13/13; manager 55/55 with one
  existing skipped case; all seven three-browser/missing/mismatch/fatal-policy
  scenarios pass; native capture/reuse acceptance passes.
- Public OCI index independently matches the measured manifest and both
  architecture child manifests. Required hosted ARM64 browser and native
  macOS/Linux acceptance remain PR gates; the local x64 pass does not replace them.
- Fresh full dependency audit retains exactly one LOW, unfixed development-only
  `deepmerge@4.3.1` finding, `GHSA-gcqx-w48m-w2h4`. Production audit has zero.
  Latest Svelte Vite plugin 7.3.1 still declares deepmerge `^4.3.1` and the
  registry's latest deepmerge is 4.3.1. Publication remains blocked by the audit
  policy unless an exact exception is explicitly approved or a fix is published.
  No old-version exception or Community approval is transferred.

The first combined check passed units but stopped on two newly introduced
Markdown blank-line findings. Those were corrected and the exact full
specification command then passed. No assertion, browser threshold, timeout,
quarantine or committed visual baseline changed. Generated native fixture
baselines remain confined to the ignored test cache.


Hosted PR74 first qualification passed package/specification, ARM64 panel and
three-browser acceptance, native macOS/Linux and non-root cleanup. The ARM64
manager lane passed 54 cases with one existing skip and failed
`tests/manager.spec.ts:1058` at its final Default choice: the mode-menu button
was absent until the unchanged 60-second timeout. The first workflow retained
no DOM context or trace. A cold exact Linux/x64 target with tracing passed
1/1; it does not reproduce or explain the native ARM64 failure.

The manager CI invocation now retains traces on failure and uploads its actual
`test-results`/Playwright report on failure. This is diagnostic evidence, not
a claimed race fix. Assertions, timeouts, skips, baseline mutation controls
and retry policy remain unchanged. The complete manager lane and all hosted
gates must pass before merge.

The complete cold Linux/x64 manager command with failure tracing enabled passes
55 cases with the same existing skip. All seven specification lanes pass with
the diagnostic workflow change. The native ARM64 result remains a fresh PR
gate; this evidence does not claim the timeout cause was repaired.
