import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverSnapshotEnvironments } from "./snapshot-environments.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporarySnapshotDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "visual-delta-environments-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("snapshot environment discovery", () => {
  it("finds unique canonical environments throughout the snapshot root", () => {
    const snapshotDir = temporarySnapshotDir();
    const nested = join(snapshotDir, "components", "button");
    mkdirSync(nested, { recursive: true });
    for (const name of [
      "default-chromium-darwin.png",
      "hover-chromium-linux.png",
      "pressed-firefox-linux.png",
      "duplicate-chromium-linux.png",
    ]) {
      writeFileSync(join(nested, name), "fixture");
    }

    expect(discoverSnapshotEnvironments(snapshotDir)).toEqual([
      { browser: "chromium", platform: "darwin" },
      { browser: "chromium", platform: "linux" },
      { browser: "firefox", platform: "linux" },
    ]);
  });

  it("ignores diagnostics, unrelated files, and unsupported browsers", () => {
    const snapshotDir = temporarySnapshotDir();
    for (const name of [
      "button-chromium-linux.actual.png",
      "button-chromium-linux.diff.png",
      "button-chromium-linux.json",
      "button-edge-win32.png",
      "button.png",
    ]) {
      writeFileSync(join(snapshotDir, name), "fixture");
    }

    expect(discoverSnapshotEnvironments(snapshotDir)).toEqual([]);
    expect(
      discoverSnapshotEnvironments(join(snapshotDir, "does-not-exist")),
    ).toEqual([]);
  });
});
