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
  it("exports the v1 viewport matrix", () => {
    expect(VISUAL_VIEWPORT).toEqual({ width: 1280, height: 900 });
    expect(VISUAL_DEVICE_SCALE_FACTOR).toBe(3);
  });
});

describe("defineVisualPlaywrightConfig", () => {
  it("builds a full chromium config with Visual Delta defaults", () => {
    const config = defineVisualPlaywrightConfig({ port: 6010 });
    expect(config.testDir).toBe("./tests/visual");
    expect(config.use?.viewport).toEqual({ width: 1280, height: 900 });
    expect(config.use?.deviceScaleFactor).toBe(3);
    expect(config.use?.baseURL).toBe("http://127.0.0.1:6010");
    expect(config.projects?.[0]?.name).toBe("chromium");
    expect(config.webServer).toMatchObject({
      url: "http://127.0.0.1:6010/index.json",
    });
  });
});
