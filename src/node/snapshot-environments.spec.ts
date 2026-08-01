import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverSnapshotBrowsers } from "./snapshot-environments.js";

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

describe("snapshot browser discovery", () => {
  it("finds unique canonical browsers throughout the snapshot root", () => {
    const snapshotDir = temporarySnapshotDir();
    const nested = join(snapshotDir, "components", "button");
    mkdirSync(nested, { recursive: true });
    for (const name of [
      "default-chromium.png",
      "hover-chromium.png",
      "pressed-firefox.png",
      "duplicate-chromium.png",
    ]) {
      writeFileSync(join(nested, name), "fixture");
    }

    expect(discoverSnapshotBrowsers(snapshotDir)).toEqual(["chromium", "firefox"]);
  });

  it("ignores diagnostics, unrelated files, and unsupported browsers", () => {
    const snapshotDir = temporarySnapshotDir();
    for (const name of [
      "button-chromium.actual.png",
      "button-chromium.diff.png",
      "button-chromium.json",
      "button-edge-win32.png",
      "button.png",
    ]) {
      writeFileSync(join(snapshotDir, name), "fixture");
    }

    expect(discoverSnapshotBrowsers(snapshotDir)).toEqual([]);
    expect(
      discoverSnapshotBrowsers(join(snapshotDir, "does-not-exist")),
    ).toEqual([]);
  });
});
