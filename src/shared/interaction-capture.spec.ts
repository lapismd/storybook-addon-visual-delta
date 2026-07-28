import { describe, expect, it } from "vitest";
import {
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
