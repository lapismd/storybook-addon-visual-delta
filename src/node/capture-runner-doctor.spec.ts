import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";
import { createDockerVisualDeltaCaptureRunner } from "./capture-runner.js";

it.each(["1.62.1", "1.63.0"])(
  "probes the selected profile's Playwright %s",
  async (version) => {
    const root = mkdtempSync(path.join(tmpdir(), "visual-delta-doctor-"));
    const probeFile = path.join(root, "probe.json");
    const originalPath = process.env.PATH;
    const originalVersion = CANONICAL_VISUAL_CAPTURE_PROFILE.playwrightVersion;
    const docker = `#!${process.execPath}\nconst args = process.argv.slice(2); if(args[0] === 'run') require('node:fs').writeFileSync(${JSON.stringify(probeFile)}, JSON.stringify(args));\n`;
    writeFileSync(path.join(root, "docker"), docker, { mode: 0o755 });
    process.env.PATH = `${root}${path.delimiter}${originalPath ?? ""}`;
    CANONICAL_VISUAL_CAPTURE_PROFILE.playwrightVersion = version;
    try {
      expect(await createDockerVisualDeltaCaptureRunner().doctor!()).toEqual({
        ok: true,
        diagnostics: [],
      });
      const probe = JSON.parse(readFileSync(probeFile, "utf8")) as string[];
      expect(probe.at(-1)).toContain(`grep -Fx "Version ${version}"`);
    } finally {
      process.env.PATH = originalPath;
      CANONICAL_VISUAL_CAPTURE_PROFILE.playwrightVersion = originalVersion;
      rmSync(root, { recursive: true, force: true });
    }
  },
);
