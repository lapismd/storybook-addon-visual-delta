import { describe, expect, it } from "vitest";
import {
  captureInteractionWithCreateVerification,
  interactionIdForInstrumenterCall,
  instrumenterCallIdForInteraction,
  readVisualCaptureCall,
} from "./interaction-capture.js";

describe("instrumenter interaction capture", () => {
  it("round-trips a deterministic top-level Storybook call", () => {
    const interactionId = interactionIdForInstrumenterCall(
      3,
      "toHaveTextContent",
    );

    expect(interactionId).toBe("interaction-3-toHaveTextContent");
    expect(
      instrumenterCallIdForInteraction(
        "shadcn-overlays-popover--opens-a-panel",
        interactionId,
      ),
    ).toBe("shadcn-overlays-popover--opens-a-panel [3] toHaveTextContent");
  });

  it("keeps named step ids on the existing capture path", () => {
    expect(
      instrumenterCallIdForInteraction(
        "shadcn-overlays-popover--opens-a-panel",
        "opens-panel",
      ),
    ).toBeNull();
  });

  it("reads an encoded call id from the iframe query", () => {
    expect(
      readVisualCaptureCall(
        "?visualCaptureCall=story%20%5B0%5D%20click&visualCaptureUntil=interaction-0-click",
      ),
    ).toBe("story [0] click");
  });
});

describe("create-only interaction capture verification", () => {
  it("verifies a newly written missing interaction without further writes", () => {
    const modes: string[] = [];
    let baselineExists = false;

    captureInteractionWithCreateVerification({
      createOnly: true,
      baselineExists: () => baselineExists,
      capture: (mode) => {
        modes.push(mode);
        if (mode === "missing") {
          baselineExists = true;
          throw new Error("snapshot did not previously exist");
        }
      },
    });

    expect(modes).toEqual(["missing", "none"]);
  });

  it("does not recover a missing-snapshot failure without the exact PNG", () => {
    const modes: string[] = [];

    expect(() =>
      captureInteractionWithCreateVerification({
        createOnly: true,
        baselineExists: () => false,
        capture: (mode) => {
          modes.push(mode);
          throw new Error("capture failed");
        },
      }),
    ).toThrow("capture failed");

    expect(modes).toEqual(["missing"]);
  });

  it("does not recover a create-only failure for a pre-existing target", () => {
    const modes: string[] = [];

    expect(() =>
      captureInteractionWithCreateVerification({
        createOnly: true,
        baselineExists: () => true,
        capture: (mode) => {
          modes.push(mode);
          throw new Error("existing target mismatch");
        },
      }),
    ).toThrow("existing target mismatch");

    expect(modes).toEqual(["missing"]);
  });

  it("fails when write-disabled verification does not pass", () => {
    const modes: string[] = [];
    let baselineExists = false;

    expect(() =>
      captureInteractionWithCreateVerification({
        createOnly: true,
        baselineExists: () => baselineExists,
        capture: (mode) => {
          modes.push(mode);
          if (mode === "missing") baselineExists = true;
          throw new Error(
            mode === "missing" ? "snapshot created" : "verification failed",
          );
        },
      }),
    ).toThrow("verification failed");

    expect(modes).toEqual(["missing", "none"]);
  });

  it("never recovers overwrite failures through create-only verification", () => {
    const modes: string[] = [];

    expect(() =>
      captureInteractionWithCreateVerification({
        createOnly: false,
        baselineExists: () => true,
        capture: (mode) => {
          modes.push(mode);
          throw new Error("overwrite failed");
        },
      }),
    ).toThrow("overwrite failed");

    expect(modes).toEqual(["all"]);
  });
});
