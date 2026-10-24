import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stagedNativeStoryPath } from "./native-write-transaction.js";
import { applyStagedArtifacts } from "./capture-artifact-validation.js";
import { runNativeCaptureProcess } from "./capture-process.js";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "vd-native-write-"));
  roots.push(root);
  const stage = path.join(root, "stage");
  mkdirSync(path.join(stage, "output"), { recursive: true });
  writeFileSync(path.join(stage, "originals.json"), "{}");
  return { root, stage };
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
describe("native write transactions", () => {
  it("stages story edits without changing the original and preserves sequential edits", () => {
    const { root, stage } = fixture();
    const source = path.join(root, "Card.stories.ts");
    writeFileSync(source, "original");
    vi.stubEnv("VISUAL_DELTA_NATIVE_STAGE", stage);
    const staged = stagedNativeStoryPath(root, source);
    writeFileSync(staged, "pending");
    expect(readFileSync(source, "utf8")).toBe("original");
    expect(readFileSync(stagedNativeStoryPath(root, source), "utf8")).toBe(
      "pending",
    );
    const artifacts = [
      {
        relativePath: "Card.stories.ts",
        sha256: hash("pending"),
        originalSha256: hash("original"),
      },
    ];
    applyStagedArtifacts({
      root,
      stagedArtifactRoot: path.join(stage, "output"),
      artifacts,
    });
    expect(readFileSync(source, "utf8")).toBe("pending");
  });
  it("rejects a conflicting destination before applying any other staged file", () => {
    const { root, stage } = fixture();
    const output = path.join(stage, "output");
    writeFileSync(path.join(output, "first.png"), "first");
    writeFileSync(path.join(output, "second.png"), "second");
    writeFileSync(path.join(root, "second.png"), "user edit");
    expect(() =>
      applyStagedArtifacts({
        root,
        stagedArtifactRoot: output,
        artifacts: [
          {
            relativePath: "first.png",
            sha256: hash("first"),
            originalSha256: null,
          },
          {
            relativePath: "second.png",
            sha256: hash("second"),
            originalSha256: null,
          },
        ],
      }),
    ).toThrow(/changed during/);
    expect(existsSync(path.join(root, "first.png"))).toBe(false);
    expect(readFileSync(path.join(root, "second.png"), "utf8")).toBe(
      "user edit",
    );
  });
  it("rejects corrupt artifacts before applying an otherwise valid write", () => {
    const { root, stage } = fixture();
    const output = path.join(stage, "output");
    writeFileSync(path.join(output, "first.png"), "first");
    writeFileSync(path.join(output, "second.png"), "corrupt");
    expect(() =>
      applyStagedArtifacts({
        root,
        stagedArtifactRoot: output,
        artifacts: [
          { relativePath: "first.png", sha256: hash("first") },
          { relativePath: "second.png", sha256: hash("second") },
        ],
      }),
    ).toThrow(/checksum/);
    expect(existsSync(path.join(root, "first.png"))).toBe(false);
  });
  it("cancels the native process group and prevents deferred output", async () => {
    const { root } = fixture();
    const marker = path.join(root, "late.txt");
    const controller = new AbortController();
    const running = runNativeCaptureProcess(
      process.execPath,
      [
        "-e",
        `setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'late'), 1000)`,
        marker,
      ],
      root,
      process.env,
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 100);
    expect(await running).toBe(130);
    expect(existsSync(marker)).toBe(false);
  });
  it("does not start a worker when already cancelled", async () => {
    const { root } = fixture();
    const controller = new AbortController();
    controller.abort();
    expect(
      await runNativeCaptureProcess(
        "unavailable-command",
        [],
        root,
        process.env,
        { signal: controller.signal },
      ),
    ).toBe(130);
  });
});

it("rejects a destination directory linked outside the approved root", () => {
  const { root, stage } = fixture();
  const external = fixture().root;
  symlinkSync(external, path.join(root, "linked"), "dir");
  mkdirSync(path.join(stage, "output/linked"));
  writeFileSync(path.join(stage, "output/linked/image.png"), "pixels");
  expect(() =>
    applyStagedArtifacts({
      root,
      stagedArtifactRoot: path.join(stage, "output"),
      artifacts: [{ relativePath: "linked/image.png", sha256: hash("pixels") }],
    }),
  ).toThrow(/symbolic link/);
  expect(existsSync(path.join(external, "image.png"))).toBe(false);
});

it("cancels detached Playwright-style descendant process groups", async () => {
  const { root } = fixture();
  const marker = path.join(root, "detached.txt");
  const controller = new AbortController();
  const program =
    "const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e',`setTimeout(()=>require('node:fs').writeFileSync(process.argv[1],'late'),1000)`,process.argv[1]],{detached:true,stdio:'ignore'}); child.once('spawn',()=>console.log('descendant ready')); setInterval(()=>{},1000);";
  const result = await runNativeCaptureProcess(
    process.execPath,
    ["-e", program, marker],
    root,
    process.env,
    {
      signal: controller.signal,
      onEvent: (event) => {
        if (event.type === "log" && event.message.includes("descendant ready"))
          controller.abort();
      },
    },
  );
  expect(result).toBe(130);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  expect(existsSync(marker)).toBe(false);
});
