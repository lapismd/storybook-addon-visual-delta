import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { waitForVisualStoryFinished } from "./readiness.js";

afterEach(() => vi.unstubAllGlobals());

describe("Storybook completion during navigation", () => {
  it.each([
    { root: null, expected: false },
    { root: "previous-story", expected: false },
    { root: "requested-story", expected: true },
  ])("retains the exact marker requirement for $root", async ({ root, expected }) => {
    vi.stubGlobal("document", {
      documentElement: root === null ? null : {
        getAttribute: (name: string) => {
          expect(name).toBe("data-visual-delta-story-finished");
          return root;
        },
      },
    });
    const waitForFunction = vi.fn(async (
      predicate: (arg: { attr: string; expected: string }) => boolean,
      arg: { attr: string; expected: string },
      options: { timeout: number },
    ) => {
      expect(predicate(arg)).toBe(expected);
      expect(options.timeout).toBe(15_000);
    });
    await waitForVisualStoryFinished({ waitForFunction } as unknown as Page, "requested-story");
    expect(waitForFunction).toHaveBeenCalledOnce();
  });
});
