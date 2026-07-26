import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILTIN_VISUAL_DELTA_DEFAULTS } from "../shared/project-defaults.js";
import {
  readVisualDeltaProjectConfig,
  visualDeltaProjectConfigPath,
  writeVisualDeltaProjectConfig,
} from "./project-config.js";

describe("project configuration", () => {
  it("uses the legacy threshold only when project config is absent", () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-config-"));
    mkdirSync(join(root, ".visual-delta"), { recursive: true });
    writeFileSync(
      join(root, ".visual-delta/playwright.json"),
      JSON.stringify({ passThresholdPercent: 2.5 }),
    );

    const legacy = readVisualDeltaProjectConfig(root);
    expect(legacy.defaults.passThresholdPercent).toBe(2.5);
    expect(legacy.sources.passThresholdPercent).toBe("legacy");

    writeVisualDeltaProjectConfig(root, {
      ...BUILTIN_VISUAL_DELTA_DEFAULTS,
      passThresholdPercent: 0.75,
    });
    const project = readVisualDeltaProjectConfig(root);
    expect(project.defaults.passThresholdPercent).toBe(0.75);
    expect(project.sources.passThresholdPercent).toBe("project");
  });

  it("writes the complete allow-list atomically and rejects unknown keys", () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-config-"));
    expect(() =>
      writeVisualDeltaProjectConfig(root, {
        ...BUILTIN_VISUAL_DELTA_DEFAULTS,
        command: "rm -rf unsafe",
      }),
    ).toThrow(/not an editable Visual Delta setting/);

    writeVisualDeltaProjectConfig(root, BUILTIN_VISUAL_DELTA_DEFAULTS);
    expect(visualDeltaProjectConfigPath(root)).toBe(
      join(root, ".visual-delta/config.json"),
    );
    expect(readVisualDeltaProjectConfig(root).diagnostics).toEqual([]);
  });

  it("reports corrupt project files without using legacy values", () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-config-"));
    mkdirSync(join(root, ".visual-delta"), { recursive: true });
    writeFileSync(join(root, ".visual-delta/config.json"), "{");
    writeFileSync(
      join(root, ".visual-delta/playwright.json"),
      JSON.stringify({ passThresholdPercent: 9 }),
    );

    const result = readVisualDeltaProjectConfig(root);
    expect(result.defaults.passThresholdPercent).toBe(
      BUILTIN_VISUAL_DELTA_DEFAULTS.passThresholdPercent,
    );
    expect(result.sources.passThresholdPercent).toBe("built-in");
    expect(result.diagnostics[0]?.code).toBe("project-config-unreadable");
  });
});
