import { describe, expect, it } from "vitest";
import {
  beginPreviewRender,
  finishPreviewRender,
  readPreviewRender,
} from "./render-lifecycle.js";

describe("preview render lifecycle", () => {
  it("allocates a fresh generation across remounts and keeps completion scoped", () => {
    const first = beginPreviewRender("hmr-story");
    const second = beginPreviewRender("hmr-story");

    expect(second.renderGeneration).toBeGreaterThan(first.renderGeneration);
    expect(readPreviewRender("hmr-story", first.renderGeneration)).toBeNull();
    expect(
      readPreviewRender("hmr-story", second.renderGeneration),
    ).toMatchObject({ storyFinished: false });

    expect(
      finishPreviewRender("other-story", second.renderGeneration),
    ).toBeNull();
    expect(finishPreviewRender("hmr-story", first.renderGeneration)).toBeNull();
    expect(
      readPreviewRender("hmr-story", second.renderGeneration),
    ).toMatchObject({ storyFinished: false });
    expect(
      finishPreviewRender("hmr-story", second.renderGeneration),
    ).toMatchObject({
      renderGeneration: second.renderGeneration,
      storyFinished: true,
    });
  });
});
