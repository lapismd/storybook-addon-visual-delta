import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { writeNativeBaselineIfApproved } from "./native-baseline-write.js";
let root: string | undefined;
afterEach(() => {
  vi.unstubAllEnvs();
  if (root) rmSync(root, { recursive: true, force: true });
});
it("requires approval and never lets native writes escape the transaction", () => {
  root = mkdtempSync(path.join(tmpdir(), "vd-native-png-"));
  vi.stubEnv("VISUAL_DELTA_NATIVE_STAGE", root);
  vi.stubEnv("VISUAL_DELTA_STAGED_SNAPSHOT_DIR", root);
  vi.stubEnv("PLAYWRIGHT_UPDATE_SNAPSHOTS", "1");
  vi.stubEnv("VISUAL_UPDATE_APPROVED", "0");
  const file = path.join(root, "button-chromium.png");
  expect(() =>
    writeNativeBaselineIfApproved(file, Buffer.from("pixels"), "passed"),
  ).toThrow(/approval/);
  vi.stubEnv("VISUAL_UPDATE_APPROVED", "1");
  expect(() =>
    writeNativeBaselineIfApproved(
      path.join(root, "../escaped.png"),
      Buffer.from("pixels"),
      "passed",
    ),
  ).toThrow(/escaped/);
  writeNativeBaselineIfApproved(file, Buffer.from("pixels"), "failed");
  expect(existsSync(file)).toBe(false);
  writeNativeBaselineIfApproved(file, Buffer.from("pixels"), "passed");
  expect(readFileSync(file, "utf8")).toBe("pixels");
  vi.stubEnv("PLAYWRIGHT_UPDATE_MODE", "missing");
  writeNativeBaselineIfApproved(file, Buffer.from("replacement"), "passed");
  expect(readFileSync(file, "utf8")).toBe("pixels");
  vi.stubEnv("PLAYWRIGHT_UPDATE_SNAPSHOTS", "0");
  writeNativeBaselineIfApproved(file, Buffer.from("replacement"), "passed");
  expect(readFileSync(file, "utf8")).toBe("pixels");
});
