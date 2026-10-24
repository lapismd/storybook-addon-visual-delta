import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import path from "node:path";

const macFontInventory = `ObjC.import('AppKit'); ObjC.import('CoreText');
var names = ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableFonts);
var fonts = names.map(function(name) {
  if (typeof name !== 'string') throw new Error('Invalid registered font name');
  var font = $.NSFont.fontWithNameSize(name, 12);
  if (ObjC.unwrap(font.fontName) !== name) throw new Error('Unresolved registered font');
  var url = $.CTFontCopyAttribute(font, $.kCTFontURLAttribute);
  return {name: name, path: ObjC.unwrap(url.path)};
});
JSON.stringify({SPFontsDataType: fonts});`;

function macFonts(): Array<{ path: string }> {
  const parse = (value: string) => {
    const rows = (JSON.parse(value) as { SPFontsDataType?: unknown })
      .SPFontsDataType;
    if (
      !Array.isArray(rows) ||
      !rows.length ||
      rows.some(
        (row) =>
          !row || typeof row.path !== "string" || !path.isAbsolute(row.path),
      )
    )
      throw new Error("Incomplete macOS font inventory.");
    return rows as Array<{ path: string }>;
  };
  try {
    return parse(
      probe("/usr/bin/osascript", ["-l", "JavaScript", "-e", macFontInventory]),
    );
  } catch {
    return parse(
      probe("/usr/sbin/system_profiler", ["SPFontsDataType", "-json"]),
    );
  }
}

function probe(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value))
    return value
      .map(canonical)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

function fileDigest(file: string): string {
  if (!path.isAbsolute(file)) throw new Error("Font paths must be absolute.");
  const fd = openSync(file, "r");
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || !before.size) throw new Error("Empty font input.");
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytes: number;
    while ((bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0)
      hash.update(buffer.subarray(0, bytes));
    const after = fstatSync(fd);
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw new Error("Font input changed during measurement.");
    return hash.digest("hex");
  } finally {
    closeSync(fd);
  }
}

/** Measured host evidence only; probe failures disable reuse, never capture. */
export function nativeFontManifestSha256(
  platform: string = process.platform,
): `sha256:${string}` | null {
  try {
    let files: string[];
    let registry: unknown;
    if (platform === "darwin") {
      const fonts = macFonts();
      files = fonts.map((entry) => entry.path);
      // Registered face names and resolved URLs include activation/priority changes.
      registry = canonical(fonts);
    } else if (platform === "linux") {
      files = probe("fc-list", ["--format", "%{file}\\n"])
        .split("\n")
        .filter(Boolean);
      const configs = probe("fc-conflist", [])
        .split("\n")
        .filter((line) => line.startsWith("+ "))
        .map((line) => {
          const separator = line.indexOf(": ", 2);
          if (separator < 0)
            throw new Error("Incomplete Fontconfig inventory.");
          return line.slice(2, separator);
        });
      if (!files.length || !configs.length) return null;
      registry = {
        // Configuration ordering and contents both affect fallback selection.
        configs: configs.map((file) => [file, fileDigest(file)]),
        environment: Object.fromEntries(
          [
            "FONTCONFIG_FILE",
            "FONTCONFIG_PATH",
            "FONTCONFIG_SYSROOT",
            "FC_LANG",
            "LANG",
            "LC_ALL",
            "LC_CTYPE",
            "FREETYPE_PROPERTIES",
          ].map((key) => [key, process.env[key] ?? null]),
        ),
      };
    } else return null;
    const fonts = [...new Set(files)]
      .sort()
      .map((file) => [file, fileDigest(file)]);
    return `sha256:${createHash("sha256")
      .update(
        JSON.stringify({
          version: 2,
          platform,
          registry,
          fonts,
        }),
      )
      .digest("hex")}`;
  } catch {
    return null;
  }
}
