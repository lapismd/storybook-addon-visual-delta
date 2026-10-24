import * as childProcess from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nativeFontManifestSha256 } from "./native-font-manifest.js";

vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof childProcess>();
  const execFileSync = vi.fn();
  return { ...actual, default: { ...actual, execFileSync }, execFileSync };
});
let root: string;
let font: string;
let second: string;
let config: string;
let report: unknown;
let fontList: string;
let configList: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "vd-font-manifest-"));
  font = path.join(root, "one.ttf");
  second = path.join(root, "two.ttc");
  config = path.join(root, "fonts.conf");
  writeFileSync(font, "font-one");
  writeFileSync(second, "font-two");
  writeFileSync(config, "fallback-one");
  report = {
    SPFontsDataType: [
      { path: font, enabled: "yes" },
      { path: second, enabled: "no" },
    ],
  };
  fontList = `${font}\n${second}\n`;
  configList = `+ ${config}: fixture fallback\n- /unused/config: disabled\n`;
  vi.mocked(childProcess.execFileSync).mockImplementation(((
    command: string,
  ) => {
    if (command.includes("system_profiler")) return JSON.stringify(report);
    if (command === "fc-list") return fontList;
    if (command === "fc-conflist") return configList;
    throw new Error("Unknown probe");
  }) as typeof childProcess.execFileSync);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  rmSync(root, { recursive: true, force: true });
});

it("hashes macOS font contents and registration state independently of report order", () => {
  const first = nativeFontManifestSha256("darwin");
  expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
  report = {
    SPFontsDataType: [
      { enabled: "no", path: second },
      { enabled: "yes", path: font },
    ],
  };
  expect(nativeFontManifestSha256("darwin")).toBe(first);
  report = {
    SPFontsDataType: [
      { enabled: "yes", path: second },
      { enabled: "yes", path: font },
    ],
  };
  expect(nativeFontManifestSha256("darwin")).not.toBe(first);
});

it("detects same-size font edits even when timestamps are restored", () => {
  const before = nativeFontManifestSha256("darwin");
  const metadata = statSync(font);
  writeFileSync(font, "font-NEW");
  utimesSync(font, metadata.atime, metadata.mtime);
  expect(nativeFontManifestSha256("darwin")).not.toBe(before);
});

it("detects font additions and removals", () => {
  const before = nativeFontManifestSha256("darwin");
  report = { SPFontsDataType: [{ path: font, enabled: "yes" }] };
  expect(nativeFontManifestSha256("darwin")).not.toBe(before);
});

it("measures Linux font files, active fallback configuration and environment", () => {
  const before = nativeFontManifestSha256("linux");
  expect(before).toMatch(/^sha256:[a-f0-9]{64}$/);
  fontList = `${second}\n${font}\n${font}\n`;
  expect(nativeFontManifestSha256("linux")).toBe(before);
  writeFileSync(config, "fallback-two");
  const changed = nativeFontManifestSha256("linux");
  expect(changed).not.toBe(before);
  vi.stubEnv("FC_LANG", "ja");
  expect(nativeFontManifestSha256("linux")).not.toBe(changed);
});

it("includes the active Fontconfig ordering", () => {
  configList = `+ ${config}: first\n+ ${font}: second\n`;
  const before = nativeFontManifestSha256("linux");
  configList = `+ ${font}: second\n+ ${config}: first\n`;
  expect(nativeFontManifestSha256("linux")).not.toBe(before);
});

it.each([
  {},
  { SPFontsDataType: [] },
  { SPFontsDataType: [{}] },
  { SPFontsDataType: [{ path: "relative.ttf" }] },
  { SPFontsDataType: [{ path: "/missing-native-font.ttf" }] },
])("disables reuse for incomplete macOS evidence: %j", (value) => {
  report = value;
  expect(nativeFontManifestSha256("darwin")).toBeNull();
});

it.each(["", "not a path", "+ incomplete configuration"])(
  "disables reuse for incomplete Fontconfig evidence: %j",
  (value) => {
    configList = value;
    expect(nativeFontManifestSha256("linux")).toBeNull();
  },
);

it("disables reuse on an empty font inventory", () => {
  fontList = "";
  expect(nativeFontManifestSha256("linux")).toBeNull();
});

it("disables reuse for malformed, unavailable or timed-out probes", () => {
  vi.mocked(childProcess.execFileSync).mockReturnValue("{" as never);
  expect(nativeFontManifestSha256("darwin")).toBeNull();
  vi.mocked(childProcess.execFileSync).mockImplementation(() => {
    throw new Error("ETIMEDOUT");
  });
  expect(nativeFontManifestSha256("darwin")).toBeNull();
  expect(nativeFontManifestSha256("linux")).toBeNull();
});

it("never invents evidence for an unsupported OS", () => {
  expect(nativeFontManifestSha256("win32")).toBeNull();
  expect(childProcess.execFileSync).not.toHaveBeenCalled();
});

it("uses the active CoreText registry and includes registered face names", () => {
  let name = "FixtureFace";
  vi.mocked(childProcess.execFileSync).mockImplementation(((
    command: string,
  ) => {
    expect(command).toBe("/usr/bin/osascript");
    return JSON.stringify({ SPFontsDataType: [{ name, path: font }] });
  }) as typeof childProcess.execFileSync);
  const first = nativeFontManifestSha256("darwin");
  expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
  name = "OtherRegisteredFace";
  expect(nativeFontManifestSha256("darwin")).not.toBe(first);
});

it("falls back when the fast macOS registry is malformed or incomplete", () => {
  vi.mocked(childProcess.execFileSync).mockImplementation(((command: string) =>
    command.includes("osascript")
      ? JSON.stringify({ SPFontsDataType: [{}] })
      : JSON.stringify(report)) as typeof childProcess.execFileSync);
  expect(nativeFontManifestSha256("darwin")).toMatch(/^sha256:[a-f0-9]{64}$/);
});
