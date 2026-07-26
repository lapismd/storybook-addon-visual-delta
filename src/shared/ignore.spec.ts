import { describe, expect, it } from "vitest";
import {
  BUILTIN_IGNORE_SELECTORS,
  countIgnoredElements,
  resolveIgnoreSelectors,
} from "./ignore.js";

describe("resolveIgnoreSelectors", () => {
  it("includes built-ins and de-dupes custom selectors", () => {
    const resolved = resolveIgnoreSelectors([
      ".toast",
      BUILTIN_IGNORE_SELECTORS[0],
      " .toast ",
    ]);
    expect(resolved[0]).toBe(BUILTIN_IGNORE_SELECTORS[0]);
    expect(resolved.filter((s) => s === ".toast")).toHaveLength(1);
  });
});

describe("countIgnoredElements", () => {
  it("deduplicates overlapping selectors and ignores malformed selectors", () => {
    document.body.innerHTML = `
      <div class="toast" data-visual-delta-ignore></div>
      <div class="toast"></div>
    `;
    expect(
      countIgnoredElements(document, [
        ".toast",
        "[data-visual-delta-ignore]",
        "[invalid",
      ]),
    ).toBe(2);
  });
});
