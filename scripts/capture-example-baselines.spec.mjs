import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";
import {
  captureOne,
  refreshExampleComparisonFixture,
} from "./capture-example-baselines.mjs";

test("settles interaction focus before writing an example baseline", async (t) => {
  const outputRoot = mkdtempSync(
    path.join(os.tmpdir(), "visual-delta-example-baseline-"),
  );
  t.after(() => rmSync(outputRoot, { force: true, recursive: true }));

  const events = [];
  const stage = {
    async boundingBox() {
      return { width: 300, height: 168 };
    },
    async screenshot(options) {
      events.push(["screenshot", options]);
    },
  };
  const page = {
    async goto(url, options) {
      events.push(["goto", url, options]);
    },
    locator(selector) {
      assert.equal(selector, "[data-testid=example-stage]");
      return stage;
    },
    async waitForSelector(selector, options) {
      events.push(["selector", selector, options]);
    },
    async waitForTimeout(delay) {
      events.push(["delay", delay]);
    },
  };

  await captureOne(
    page,
    {
      id: "examples-interactions--with-interaction-baseline",
      out: "interactions/opened.png",
      async prepare() {
        events.push(["prepare"]);
      },
    },
    {
      baseUrl: "http://127.0.0.1:9109",
      outputRoot,
      async settle(settledPage, options) {
        assert.equal(settledPage, page);
        events.push(["settle", options]);
      },
    },
  );

  assert.deepEqual(
    events.map(([event]) => event),
    ["goto", "selector", "delay", "prepare", "settle", "screenshot"],
  );
  assert.deepEqual(events.at(-2), ["settle", { delay: 100 }]);
  assert.deepEqual(events.at(-1), [
    "screenshot",
    {
      animations: "disabled",
      caret: "hide",
      path: path.join(outputRoot, "interactions/opened.png"),
    },
  ]);
});

test("recompares the committed actual after regenerating its baseline", (t) => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "visual-delta-example-comparison-"),
  );
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const baselineRoot = path.join(root, "tests/examples-snapshots/examples");
  const artifactRoot = path.join(
    root,
    ".visual-delta/artifacts/examples/interactions",
  );
  mkdirSync(path.join(baselineRoot, "interactions"), { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  const encoded = PNG.sync.write(png);
  const actualPath = path.join(artifactRoot, "opened.actual.png");
  const resultPath = path.join(artifactRoot, "opened.result.json");
  writeFileSync(path.join(baselineRoot, "interactions/opened.png"), encoded);
  writeFileSync(actualPath, encoded);
  writeFileSync(
    resultPath,
    `${JSON.stringify({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      renderFingerprint: "render-v1",
      captureOperationId: "capture-v1",
      actualCapturedAt: "2026-08-01T00:00:00.000Z",
    })}\n`,
  );

  const sidecar = refreshExampleComparisonFixture({
    root,
    baselineRoot,
    actualPath,
    resultPath,
  });

  assert.equal(sidecar?.passThresholdPercent, 0.063);
  assert.equal(sidecar?.diffPixels, 0);
  assert.equal(sidecar?.outcome, "passed");
  assert.equal(sidecar?.comparisonSource, "cached-actual");
  assert.equal(sidecar?.captureOperationId, "capture-v1");
  assert.deepEqual(
    JSON.parse(readFileSync(resultPath, "utf8")),
    sidecar,
  );
});
