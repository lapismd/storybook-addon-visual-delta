import { describe, expect, it } from "vitest";
import { BUILTIN_VISUAL_DELTA_DEFAULTS } from "../shared/project-defaults.js";
import { buildInitPayload } from "./init.js";

describe("buildInitPayload", () => {
  it("resolves story parameters over project defaults over built-ins", () => {
    const projectDefaults = {
      ...BUILTIN_VISUAL_DELTA_DEFAULTS,
      passThresholdPercent: 2,
      diffThreshold: 0.4,
      placement: "left" as const,
      opacity: 0.75,
      baselineLabelOffset: { x: 5, y: -3 },
    };
    const project = buildInitPayload(
      {
        id: "story",
        name: "Story",
        layout: "centered",
        renderGeneration: 7,
        storyFinished: true,
      },
      { images: "/baseline.png" },
      projectDefaults,
    );
    expect(project).toMatchObject({
      align: "viewport",
      placement: "left",
      opacity: 1,
      passThresholdPercent: 2,
      diffThreshold: 0.4,
      deviceScaleFactor: 1,
      baselineLabelOffset: { x: 5, y: -3 },
      layout: "centered",
      renderGeneration: 7,
      storyFinished: true,
    });
    expect(project.images[0]?.deviceScaleFactor).toBe(1);

    const story = buildInitPayload(
      { id: "story", name: "Story" },
      {
        images: "/baseline.png",
        placement: "center",
        align: "canvas",
        opacity: 0.25,
        passThresholdPercent: 0.5,
        deviceScaleFactor: 3,
        baselineLabelOffset: { x: 1, y: 2 },
      },
      projectDefaults,
    );
    expect(story).toMatchObject({
      align: "canvas",
      placement: "center",
      opacity: 0.25,
      passThresholdPercent: 0.5,
      deviceScaleFactor: 3,
      baselineLabelOffset: { x: 1, y: 2 },
    });
    expect(story.images[0]?.deviceScaleFactor).toBe(3);
  });
});
