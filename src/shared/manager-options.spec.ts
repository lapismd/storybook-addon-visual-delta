import { describe, expect, it } from "vitest";
import {
  renderToolbarStatusManagerHead,
  resolveToolbarStatusEnabled,
  TOOLBAR_STATUS_GLOBAL,
} from "./manager-options.js";

describe("resolveToolbarStatusEnabled", () => {
  it("defaults to enabled and preserves an explicit opt-out", () => {
    expect(resolveToolbarStatusEnabled()).toBe(true);
    expect(resolveToolbarStatusEnabled(true)).toBe(true);
    expect(resolveToolbarStatusEnabled(false)).toBe(false);
  });
});

describe("renderToolbarStatusManagerHead", () => {
  it("serializes the default enabled value for the manager runtime", () => {
    expect(renderToolbarStatusManagerHead(true)).toBe(
      `<script>globalThis.${TOOLBAR_STATUS_GLOBAL}=true;</script>`,
    );
  });

  it("serializes the host opt-out", () => {
    expect(renderToolbarStatusManagerHead(false)).toBe(
      `<script>globalThis.${TOOLBAR_STATUS_GLOBAL}=false;</script>`,
    );
  });
});
