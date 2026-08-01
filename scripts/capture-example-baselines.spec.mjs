import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { captureOne } from "./capture-example-baselines.mjs";

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
