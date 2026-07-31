import { describe, expect, it } from "vitest";
import {
  rewriteSpecHref,
  storybookDocsIdFromTitle,
  storybookDocsPathFromTitle,
} from "./spec-chapters.js";

describe("spec-chapters Storybook docs mapping", () => {
  it("slugs titles the way Storybook docs paths expect", () => {
    expect(
      storybookDocsIdFromTitle(
        "Visual Delta/Specification/Panel and preview",
      ),
    ).toBe("visual-delta-specification-panel-and-preview");
    expect(
      storybookDocsPathFromTitle(
        "Visual Delta/Specification/System specification",
      ),
    ).toBe("/?path=/docs/visual-delta-specification-system-specification--docs");
  });

  it("rewrites relative chapter links and preserves hashes", () => {
    expect(rewriteSpecHref("./architecture.md")).toBe(
      "/?path=/docs/visual-delta-specification-architecture--docs",
    );
    expect(rewriteSpecHref("verification.md#vd-gap-001")).toBe(
      "/?path=/docs/visual-delta-specification-verification--docs#vd-gap-001",
    );
    expect(rewriteSpecHref("https://example.com/x")).toBe(
      "https://example.com/x",
    );
    expect(rewriteSpecHref("#local")).toBe("#local");
  });
});
