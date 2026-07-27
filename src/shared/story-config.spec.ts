import { describe, expect, it } from "vitest";
import { BUILTIN_VISUAL_DELTA_DEFAULTS } from "./project-defaults.js";
import {
  baselineAlignmentMismatch,
  resolveVisualDeltaStoryConfig,
  validateVisualDeltaStoryConfigUpdate,
} from "./story-config.js";

const sources = Object.fromEntries(
  Object.keys(BUILTIN_VISUAL_DELTA_DEFAULTS).map((key) => [key, "built-in"]),
) as Parameters<typeof resolveVisualDeltaStoryConfig>[2];

describe("story configuration", () => {
  it("resolves story overrides ahead of project defaults with sources", () => {
    const resolved = resolveVisualDeltaStoryConfig(
      { align: "canvas", opacity: 0.75 },
      BUILTIN_VISUAL_DELTA_DEFAULTS,
      sources,
    );

    expect(resolved.values.align).toBe("canvas");
    expect(resolved.values.opacity).toBe(0.75);
    expect(resolved.values.placement).toBe("right");
    expect(resolved.sources.align).toBe("story");
    expect(resolved.sources.opacity).toBe("story");
    expect(resolved.sources.placement).toBe("built-in");
  });

  it("accepts allow-listed exact-story updates and rejects conflicts", () => {
    expect(
      validateVisualDeltaStoryConfigUpdate({
        storyId: "example--story",
        values: { align: "viewport", delay: 250 },
      }),
    ).toEqual({
      value: {
        storyId: "example--story",
        values: { align: "viewport", delay: 250 },
        unset: [],
      },
      errors: [],
    });

    expect(
      validateVisualDeltaStoryConfigUpdate({
        storyId: "example--story",
        values: { align: "viewport", arbitrary: true },
        unset: ["align"],
      }).errors,
    ).toEqual([
      "arbitrary is not an editable story setting.",
      "align cannot be both updated and reset.",
    ]);
  });
});

describe("baseline alignment configuration", () => {
  it("recommends viewport alignment for a viewport-sized canvas baseline", () => {
    expect(
      baselineAlignmentMismatch({
        configured: "canvas",
        baselineCss: { width: 1280, height: 900 },
        liveCss: { width: 1232, height: 146 },
        captureViewport: { width: 1280, height: 900 },
        cropToViewport: false,
      }),
    ).toMatchObject({
      configured: "canvas",
      recommended: "viewport",
      reason: "viewport-sized-baseline",
    });
  });

  it("recommends canvas alignment for a component-sized viewport baseline", () => {
    expect(
      baselineAlignmentMismatch({
        configured: "viewport",
        baselineCss: { width: 420, height: 120 },
        liveCss: { width: 420, height: 120 },
        captureViewport: { width: 1280, height: 900 },
        cropToViewport: false,
      }),
    ).toMatchObject({
      configured: "viewport",
      recommended: "canvas",
      reason: "component-sized-baseline",
    });
  });
});
