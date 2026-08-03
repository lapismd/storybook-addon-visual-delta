import { describe, expect, it } from "vitest";
import {
  ansiColorToCss,
  ansiLogTail,
  ansiRawTail,
  compactAnsiColorIndex,
  lastMeaningfulAnsiLine,
  parseAnsiLog,
} from "./ansi-log.js";

describe("parseAnsiLog", () => {
  it("preserves plain text and groups standard colour and emphasis styles", () => {
    const parsed = parseAnsiLog(
      `plain \u001b[31;1merror\u001b[0m \u001b[3;4;9mstyled\u001b[0m`,
    );

    expect(parsed.text).toBe("plain error styled");
    expect(parsed.segments).toEqual([
      { text: "plain ", style: {} },
      {
        text: "error",
        style: {
          foreground: { kind: "standard", index: 1 },
          bold: true,
        },
      },
      { text: " ", style: {} },
      {
        text: "styled",
        style: { italic: true, underline: true, strikethrough: true },
      },
    ]);
  });

  it("supports bright, indexed, RGB, background, inverse, and reset codes", () => {
    const parsed = parseAnsiLog(
      `\u001b[94;48;5;196;7mA\u001b[27;38;2;1;2;3;49mB\u001b[39mC`,
    );

    expect(parsed.segments).toEqual([
      {
        text: "A",
        style: {
          foreground: { kind: "standard", index: 12 },
          background: { kind: "indexed", index: 196 },
          inverse: true,
        },
      },
      {
        text: "B",
        style: {
          foreground: { kind: "rgb", red: 1, green: 2, blue: 3 },
          background: undefined,
          inverse: false,
        },
      },
      {
        text: "C",
        style: {
          foreground: undefined,
          background: undefined,
          inverse: false,
        },
      },
    ]);
    expect(
      ansiColorToCss({ kind: "indexed", index: 196 }),
    ).toBe("rgb(255, 0, 0)");
    expect(
      ansiColorToCss({ kind: "rgb", red: 1, green: 2, blue: 3 }),
    ).toBe("rgb(1, 2, 3)");
    expect(compactAnsiColorIndex({ kind: "indexed", index: 12 })).toBe(12);
    expect(compactAnsiColorIndex({ kind: "indexed", index: 196 })).toBeNull();
  });

  it("normalizes carriage returns, backspaces, and erase-line controls", () => {
    expect(
      parseAnsiLog(
        `Downloading 100%\rDone\u001b[K\nabc\bX\nstale\u001b[2Kfresh`,
      ).text,
    ).toBe("Done\nabX\nfresh");
  });

  it("removes OSC and unsupported controls without interpreting content as HTML", () => {
    const parsed = parseAnsiLog(
      `\u001b]8;;https://example.invalid\u0007<link>\u001b]8;;\u0007\u001b[2A<script>alert(1)</script>`,
    );

    expect(parsed.text).toBe("<link><script>alert(1)</script>");
    expect(parsed.text).not.toContain("example.invalid");
    expect(parsed.text).not.toContain("\u001b");
  });

  it("drops incomplete control sequences instead of exposing tokens", () => {
    expect(parseAnsiLog("ready\u001b[38;2;10").text).toBe("ready");
    expect(parseAnsiLog("ready\u001b]8;;https://example.invalid").text).toBe(
      "ready",
    );
  });
});

describe("ANSI log selection", () => {
  it("bounds raw logs without retaining a partial colour token", () => {
    const raw = "prefix\u001b[31mred";
    expect(ansiRawTail(raw, 7)).toBe("red");
    expect(parseAnsiLog(ansiRawTail(raw, 7)).text).toBe("red");
    expect(ansiRawTail("prefix\u001b]8;;unfinished", 5)).toBe("");
  });

  it("takes a styled tail after parsing rather than slicing escape codes", () => {
    const tail = ansiLogTail(
      parseAnsiLog("\u001b[31m12345\u001b[0m6789"),
      6,
    );

    expect(tail.text).toBe("456789");
    expect(tail.segments).toEqual([
      {
        text: "45",
        style: { foreground: { kind: "standard", index: 1 } },
      },
      { text: "6789", style: {} },
    ]);
  });

  it("returns the last meaningful line with its styles intact", () => {
    expect(
      lastMeaningfulAnsiLine(
        parseAnsiLog("start\n\u001b[32;1mpassed\u001b[0m\n\n"),
      ),
    ).toEqual({
      text: "passed",
      segments: [
        {
          text: "passed",
          style: {
            foreground: { kind: "standard", index: 2 },
            bold: true,
          },
        },
      ],
    });
  });
});
