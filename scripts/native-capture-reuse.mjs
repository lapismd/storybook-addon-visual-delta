import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const nativeSnapshotDir = "tests/visual/storybook.spec.ts-snapshots";
export function nativeCapturePaths(root) {
  const namespace = `profiles/native/${process.platform}-${process.arch}`;
  const baselineRoot = path.join(root, nativeSnapshotDir, namespace);
  return {
    baselineRoot,
    artifactRoot: path.join(root, ".visual-delta/artifacts", namespace),
    baseline: path.join(baselineRoot, "native--basic-chromium.png"),
  };
}

export function nativeCaptureResult(
  artifactRoot,
  browser = "chromium",
  variant = "",
) {
  return JSON.parse(
    readFileSync(
      path.join(artifactRoot, `native--basic${variant}-${browser}.result.json`),
      "utf8",
    ),
  );
}

export function verifyNativeCaptureReuse({
  run,
  compare,
  browsers,
  artifactRoot,
  baselineRoot,
  baseline,
  bytes,
}) {
  const readResult = (browser, variant = "") =>
    nativeCaptureResult(artifactRoot, browser, variant);
  const result = readResult("chromium");
  assert.equal(result.captureProfile.os, process.platform);
  assert.equal(result.captureProfile.kind, "native");
  assert.match(
    result.captureProfile.fontManifestSha256,
    /^sha256:[a-f0-9]{64}$/,
  );
  assert.equal(result.outcome, "passed");
  assert.equal(result.passThresholdPercent, 0.5);
  const reused = compare.filter((arg) => arg !== "--fresh");
  const originals = new Map(
    browsers.flatMap((browser) =>
      ["", "--contrast"].map((variant) => [
        `${browser}${variant}`,
        readResult(browser, variant).captureOperationId,
      ]),
    ),
  );
  run(reused);
  for (const browser of browsers)
    for (const variant of ["", "--contrast"]) {
      const cached = readResult(browser, variant);
      assert.equal(cached.comparisonSource, "cached-actual");
      assert.equal(
        cached.captureOperationId,
        originals.get(`${browser}${variant}`),
      );
    }
  // Corrupt one target: only its browser must recapture the complete mode set.
  writeFileSync(
    path.join(artifactRoot, "native--basic-chromium.actual.png"),
    "corrupt",
  );
  run(reused);
  assert.notEqual(
    readResult("chromium").captureOperationId,
    originals.get("chromium"),
  );
  for (const browser of browsers.filter((browser) => browser !== "chromium"))
    assert.equal(
      readResult(browser).captureOperationId,
      originals.get(browser),
    );
  // Baseline edits must recompare the cached raw actual, without accepting it.
  writeFileSync(
    baseline,
    readFileSync(
      path.join(baselineRoot, "native--basic--contrast-chromium.png"),
    ),
  );
  run(reused, 1);
  assert.equal(readResult("chromium").comparisonSource, "cached-actual");
  assert.equal(readResult("chromium").outcome, "mismatch");
  writeFileSync(baseline, bytes);
  run(reused);
  run([
    "test",
    "--all",
    "--snapshot-dir",
    nativeSnapshotDir,
    "--failure-mode",
    "strict",
  ]);
  assert.equal(readResult("chromium").comparisonSource, "cached-actual");
  const unchanged = run([
    "test",
    "--affected",
    "--snapshot-dir",
    nativeSnapshotDir,
    "--explain",
  ]);
  assert.equal(unchanged.stdout.trim(), "Up to date · 1 unchanged");
  console.log(
    "Native reuse: primary/modes, corruption, baseline edits and affected no-op passed.",
  );
  const beforeFresh = readResult("chromium").captureOperationId;
  run(compare);
  assert.equal(readResult("chromium").comparisonSource, "browser");
  assert.notEqual(readResult("chromium").captureOperationId, beforeFresh);
  console.log("Native reuse: --fresh bypass passed.");
  return () => {
    const captureId = readResult("chromium", "--active").captureOperationId;
    run([...reused, "--step-id", "active"]);
    const cached = readResult("chromium", "--active");
    assert.equal(cached.comparisonSource, "cached-actual");
    assert.equal(cached.captureOperationId, captureId);
    console.log("Native reuse: interaction cache passed.");
  };
}
