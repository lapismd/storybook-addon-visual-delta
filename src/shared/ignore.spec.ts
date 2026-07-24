import { describe, expect, it } from "vitest";
import {
  BUILTIN_IGNORE_SELECTORS,
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
