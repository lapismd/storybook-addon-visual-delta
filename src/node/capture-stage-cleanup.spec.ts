import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { cleanupCaptureStage } from "./capture-stage-cleanup.js";

const image = `ghcr.io/example/capture@sha256:${"a".repeat(64)}`;
const permission = Object.assign(new Error("private stage permission"), {
  code: "EACCES",
});

it("keeps ordinary host cleanup local", () => {
  const stage = mkdtempSync(path.join(tmpdir(), "visual-delta-capture-"));
  const runContainer = vi.fn();
  cleanupCaptureStage(stage, image, { runContainer });
  expect(existsSync(stage)).toBe(false);
  expect(runContainer).not.toHaveBeenCalled();
});

it("recovers root-owned stage cleanup through only the pinned private mount", () => {
  const stage = mkdtempSync(path.join(tmpdir(), "visual-delta-capture-"));
  const remove = vi
    .fn((target: string) => rmSync(target, { recursive: true, force: true }))
    .mockImplementationOnce(() => {
      throw permission;
    });
  const runContainer = vi.fn();
  try {
    cleanupCaptureStage(stage, image, { remove, runContainer });
    const args = runContainer.mock.calls[0]?.[0] as string[];
    expect(args).toContain(image);
    expect(args).toContain(
      `type=bind,src=${realpathSync(tmpdir())}/${path.basename(stage)},dst=/cleanup`,
    );
    expect(args).toContain("--network=none");
    expect(args).toContain("--read-only");
    expect(args).not.toContain("bash");
    expect(remove).toHaveBeenCalledTimes(2);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

it("rejects unrelated directories, symlink stages and mutable image tags", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "capture-cleanup-outside-"));
  const external = path.join(parent, "user-data");
  writeFileSync(external, "preserve");
  const link = path.join(
    tmpdir(),
    `visual-delta-capture-link-${path.basename(parent)}`,
  );
  symlinkSync(parent, link, "dir");
  const stage = mkdtempSync(path.join(tmpdir(), "visual-delta-capture-"));
  const runContainer = vi.fn();
  const remove = () => {
    throw permission;
  };
  try {
    for (const [directory, candidateImage] of [
      [parent, image],
      [link, image],
      [stage, "image:latest"],
    ]) {
      expect(() =>
        cleanupCaptureStage(directory!, candidateImage!, {
          remove,
          runContainer,
        }),
      ).toThrow(/Refusing/);
    }
    expect(runContainer).not.toHaveBeenCalled();
    expect(existsSync(external)).toBe(true);
  } finally {
    rmSync(link, { force: true });
    rmSync(parent, { recursive: true, force: true });
    rmSync(stage, { recursive: true, force: true });
  }
});

it("does not retry unrelated host errors or suppress container failures", () => {
  const stage = mkdtempSync(path.join(tmpdir(), "visual-delta-capture-"));
  const runContainer = vi.fn(() => {
    throw new Error("cleanup container unavailable");
  });
  try {
    expect(() =>
      cleanupCaptureStage(stage, image, {
        remove: () => {
          throw new Error("unrelated");
        },
        runContainer,
      }),
    ).toThrow("unrelated");
    expect(runContainer).not.toHaveBeenCalled();
    expect(() =>
      cleanupCaptureStage(stage, image, {
        remove: () => {
          throw permission;
        },
        runContainer,
      }),
    ).toThrow("cleanup container unavailable");
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});
