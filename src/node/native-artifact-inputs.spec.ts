import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { stageNativeActualArtifacts } from "./native-artifact-inputs.js";
import { captureNamespace } from "./capture-configuration.js";

let root: string;
let output: string;
let namespace: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "vd-native-artifact-inputs-"));
  output = path.join(root, "stage");
  vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE", "native");
  namespace = path.join(".visual-delta/artifacts", captureNamespace(root));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
const put = (file: string, value: string) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
};

it("stages actuals and sidecars only from the selected native namespace", () => {
  const actual = path.join(namespace, "example-chromium.actual.png");
  const result = path.join(namespace, "example-chromium.result.json");
  put(path.join(root, actual), "raw capture");
  put(path.join(root, result), "capture provenance");
  put(
    path.join(root, ".visual-delta/artifacts/docker-only.actual.png"),
    "Docker",
  );
  put(
    path.join(
      root,
      ".visual-delta/artifacts/profiles/other/linux-arm64/private.png",
    ),
    "other profile",
  );
  stageNativeActualArtifacts(root, output);
  expect(readFileSync(path.join(output, actual), "utf8")).toBe("raw capture");
  expect(readFileSync(path.join(output, result), "utf8")).toBe(
    "capture provenance",
  );
  expect(
    existsSync(
      path.join(output, ".visual-delta/artifacts/docker-only.actual.png"),
    ),
  ).toBe(false);
  expect(
    existsSync(path.join(output, ".visual-delta/artifacts/profiles/other")),
  ).toBe(false);
  writeFileSync(path.join(output, actual), "changed staged capture");
  expect(readFileSync(path.join(root, actual), "utf8")).toBe("raw capture");
});

it("treats missing evidence as a cache miss", () => {
  stageNativeActualArtifacts(root, output);
  expect(existsSync(path.join(output, namespace))).toBe(false);
});

it("rejects symlinked evidence without touching the linked data", () => {
  const external = path.join(root, "external.txt");
  put(external, "preserved");
  const source = path.join(root, namespace);
  mkdirSync(source, { recursive: true });
  symlinkSync(external, path.join(source, "unsafe.actual.png"));
  put(path.join(source, "valid.actual.png"), "valid neighboring capture");
  stageNativeActualArtifacts(root, output);
  expect(existsSync(path.join(output, namespace, "unsafe.actual.png"))).toBe(
    false,
  );
  expect(
    readFileSync(path.join(output, namespace, "valid.actual.png"), "utf8"),
  ).toBe("valid neighboring capture");
  expect(readFileSync(external, "utf8")).toBe("preserved");
});

it("rejects a linked profile root without exposing its contents", () => {
  const external = path.join(root, "external");
  put(path.join(external, "private.actual.png"), "preserved");
  const source = path.join(root, namespace);
  mkdirSync(path.dirname(source), { recursive: true });
  symlinkSync(external, source, "dir");
  stageNativeActualArtifacts(root, output);
  expect(existsSync(path.join(output, namespace))).toBe(false);
  expect(readFileSync(path.join(external, "private.actual.png"), "utf8")).toBe(
    "preserved",
  );
});
