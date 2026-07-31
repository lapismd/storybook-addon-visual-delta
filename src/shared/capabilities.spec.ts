import { describe, expect, it } from "vitest";
import {
  resolveCapabilitiesFromEnvironment,
  resolveVisualDeltaCapabilities,
  READ_ONLY_GLOBAL,
} from "./capabilities.js";

describe("resolveVisualDeltaCapabilities", () => {
  it("enables middleware surfaces in development by default", () => {
    const caps = resolveVisualDeltaCapabilities({
      configType: "DEVELOPMENT",
      runtime: "unknown",
    });
    expect(caps.readOnly).toBe(false);
    expect(caps.writes).toBe(true);
    expect(caps.chromiumCompare).toBe(true);
    expect(caps.testingModule).toBe(true);
  });

  it("forces read-only when host readOnly is true", () => {
    const caps = resolveVisualDeltaCapabilities({
      forcedReadOnly: true,
      configType: "DEVELOPMENT",
      runtime: "ok",
    });
    expect(caps).toMatchObject({
      readOnly: true,
      writes: false,
      chromiumCompare: false,
      runs: false,
      configuration: false,
      changes: false,
      init: false,
      history: false,
      testingModule: false,
    });
  });

  it("is read-only for static PRODUCTION builds", () => {
    const caps = resolveVisualDeltaCapabilities({
      configType: "PRODUCTION",
      runtime: "unknown",
    });
    expect(caps.readOnly).toBe(true);
    expect(caps.writes).toBe(false);
  });

  it("is read-only when runtime middleware is unsupported", () => {
    const caps = resolveVisualDeltaCapabilities({
      configType: "DEVELOPMENT",
      runtime: "unsupported",
    });
    expect(caps.readOnly).toBe(true);
  });
});

describe("resolveCapabilitiesFromEnvironment", () => {
  it("reads the managerHead force flag", () => {
    const globalObject = {
      CONFIG_TYPE: "DEVELOPMENT",
      [READ_ONLY_GLOBAL]: true,
    } as typeof globalThis;
    expect(resolveCapabilitiesFromEnvironment(globalObject).readOnly).toBe(
      true,
    );
  });
});
