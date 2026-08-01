import { describe, expect, it } from "vitest";
import {
  defineVisualPlaywrightConfig,
  visualUpdateSnapshotsMode,
  VISUAL_DEVICE_SCALE_FACTOR,
  VISUAL_VIEWPORT,
} from "./config.js";

describe("visualUpdateSnapshotsMode", () => {
  it("defaults to none", () => {
    const prev = process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS;
    const mode = process.env.PLAYWRIGHT_UPDATE_MODE;
    delete process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS;
    delete process.env.PLAYWRIGHT_UPDATE_MODE;
    expect(visualUpdateSnapshotsMode()).toBe("none");
    if (prev !== undefined) process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS = prev;
    if (mode !== undefined) process.env.PLAYWRIGHT_UPDATE_MODE = mode;
  });

  it("maps missing vs all when updating", () => {
    const prev = process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS;
    const mode = process.env.PLAYWRIGHT_UPDATE_MODE;
    process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS = "1";
    delete process.env.PLAYWRIGHT_UPDATE_MODE;
    expect(visualUpdateSnapshotsMode()).toBe("all");
    process.env.PLAYWRIGHT_UPDATE_MODE = "missing";
    expect(visualUpdateSnapshotsMode()).toBe("missing");
    if (prev === undefined) delete process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS;
    else process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS = prev;
    if (mode === undefined) delete process.env.PLAYWRIGHT_UPDATE_MODE;
    else process.env.PLAYWRIGHT_UPDATE_MODE = mode;
  });
});

describe("visual capture constants", () => {
  it("exports the v1 viewport matrix and built-in scale default", () => {
    expect(VISUAL_VIEWPORT).toEqual({ width: 1280, height: 900 });
    expect(VISUAL_DEVICE_SCALE_FACTOR).toBe(1);
  });
});

describe("defineVisualPlaywrightConfig", () => {
  it("builds a full chromium config with Visual Delta defaults", () => {
    const config = defineVisualPlaywrightConfig({ port: 6010 });
    expect(config.testDir).toBe("./tests/visual");
    expect(config.use?.viewport).toEqual({ width: 1280, height: 900 });
    // Effective scale comes from cwd project config when present (UI host: 3).
    expect(config.use?.deviceScaleFactor).toBeGreaterThanOrEqual(1);
    expect(config.use?.deviceScaleFactor).toBeLessThanOrEqual(8);
    expect(config.use?.baseURL).toBe("http://127.0.0.1:6010");
    expect(config.projects?.[0]?.name).toBe("chromium");
    expect(config.snapshotPathTemplate).toBe(
      "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}",
    );
    expect(config.webServer).toMatchObject({
      url: "http://127.0.0.1:6010/iframe.html",
    });
  });

  it("generates Chromium, Firefox, and WebKit projects from an explicit matrix", () => {
    const config = defineVisualPlaywrightConfig({
      browsers: ["chromium", "firefox", "webkit"],
    });
    expect(config.projects?.map((project) => project.name)).toEqual([
      "chromium",
      "firefox",
      "webkit",
    ]);
    expect(
      config.projects?.map(
        (project) =>
          (project.use as { defaultBrowserType?: string } | undefined)
            ?.defaultBrowserType,
      ),
    ).toEqual(["chromium", "firefox", "webkit"]);
  });
});
