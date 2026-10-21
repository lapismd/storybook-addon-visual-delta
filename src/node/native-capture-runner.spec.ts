import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeVisualDeltaCaptureRunner } from "./native-capture-runner.js";
import { createCaptureJobManifest } from "./capture-runner.js";
const roots: string[] = [];
const root = () => {
  const value = mkdtempSync(path.join(tmpdir(), "vd-native-runner-"));
  roots.push(value);
  return value;
};
afterEach(() => {
  vi.unstubAllEnvs();
  for (const value of roots.splice(0))
    rmSync(value, { recursive: true, force: true });
});
describe("native runner identity", () => {
  it("cannot launch a native runner under the Docker profile identity", () => {
    vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE", "docker");
    expect(() => createNativeVisualDeltaCaptureRunner(root())).toThrow(
      /Select a native capture profile/,
    );
  });
  it("reports the real host and diagnoses missing project dependencies", async () => {
    vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE", "native");
    const runner = createNativeVisualDeltaCaptureRunner(root());
    expect(runner.profile).toMatchObject({
      schemaVersion: 2,
      os: process.platform,
      architecture: process.arch,
      image: null,
    });
    const probe = await runner.doctor!();
    expect(probe.ok).toBe(false);
    expect(probe.diagnostics.join(" ")).toMatch(
      /install.*Playwright|Install playwright/,
    );
  });
  it("rejects a manifest for another project before launching any tools", async () => {
    vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE", "native");
    const runner = createNativeVisualDeltaCaptureRunner(root());
    await expect(
      runner.run(
        createCaptureJobManifest({
          root: root(),
          operation: "test",
          argv: ["test", "--all"],
        }),
        {},
      ),
    ).rejects.toThrow(/another project root/);
  });
});
