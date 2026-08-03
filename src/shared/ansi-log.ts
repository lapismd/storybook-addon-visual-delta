export type AnsiColor =
  | { kind: "standard"; index: number }
  | { kind: "indexed"; index: number }
  | { kind: "rgb"; red: number; green: number; blue: number };

export type AnsiTextStyle = {
  foreground?: AnsiColor;
  background?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
};

export type AnsiTextSegment = {
  text: string;
  style: AnsiTextStyle;
};

export type AnsiLogLine = {
  text: string;
  segments: AnsiTextSegment[];
};

export type ParsedAnsiLog = {
  text: string;
  lines: AnsiLogLine[];
  segments: AnsiTextSegment[];
};

type TerminalCell = {
  text: string;
  style: AnsiTextStyle;
  styleKey: string;
};

const ESC = "\u001b";

const ANSI_TERMINAL_PALETTE = [
  "#5c6370",
  "#e06c75",
  "#98c379",
  "#e5c07b",
  "#61afef",
  "#c678dd",
  "#56b6c2",
  "#c8cdd5",
  "#7f8795",
  "#ff7a85",
  "#b5e890",
  "#ffd580",
  "#80bfff",
  "#dc92ff",
  "#74dce8",
  "#f0f3f6",
] as const;

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function cloneColor(color: AnsiColor | undefined): AnsiColor | undefined {
  return color ? { ...color } : undefined;
}

function cloneStyle(style: AnsiTextStyle): AnsiTextStyle {
  return {
    ...style,
    foreground: cloneColor(style.foreground),
    background: cloneColor(style.background),
  };
}

function colorKey(color: AnsiColor | undefined): string {
  if (!color) return "";
  if (color.kind === "rgb") {
    return `r:${color.red}:${color.green}:${color.blue}`;
  }
  return `${color.kind[0]}:${color.index}`;
}

function styleKey(style: AnsiTextStyle): string {
  return [
    colorKey(style.foreground),
    colorKey(style.background),
    style.bold ? "b" : "",
    style.dim ? "d" : "",
    style.italic ? "i" : "",
    style.underline ? "u" : "",
    style.strikethrough ? "s" : "",
    style.inverse ? "v" : "",
  ].join("|");
}

function parseSgrParameters(raw: string): number[] {
  if (!raw) return [0];
  return raw.split(";").map((value) => {
    if (!value) return 0;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : -1;
  });
}

function extendedColor(
  parameters: readonly number[],
  index: number,
): { color?: AnsiColor; consumed: number } {
  if (parameters[index + 1] === 5 && parameters[index + 2] != null) {
    return {
      color: {
        kind: "indexed",
        index: clampByte(parameters[index + 2]!),
      },
      consumed: 2,
    };
  }
  if (
    parameters[index + 1] === 2 &&
    parameters[index + 2] != null &&
    parameters[index + 3] != null &&
    parameters[index + 4] != null
  ) {
    return {
      color: {
        kind: "rgb",
        red: clampByte(parameters[index + 2]!),
        green: clampByte(parameters[index + 3]!),
        blue: clampByte(parameters[index + 4]!),
      },
      consumed: 4,
    };
  }
  return { consumed: 0 };
}

function applySgr(style: AnsiTextStyle, raw: string): AnsiTextStyle {
  const parameters = parseSgrParameters(raw);
  let next = cloneStyle(style);
  for (let index = 0; index < parameters.length; index += 1) {
    const code = parameters[index];
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 7) next.inverse = true;
    else if (code === 9) next.strikethrough = true;
    else if (code === 22) {
      next.bold = false;
      next.dim = false;
    } else if (code === 23) next.italic = false;
    else if (code === 24) next.underline = false;
    else if (code === 27) next.inverse = false;
    else if (code === 29) next.strikethrough = false;
    else if (code != null && code >= 30 && code <= 37) {
      next.foreground = { kind: "standard", index: code - 30 };
    } else if (code === 38) {
      const parsed = extendedColor(parameters, index);
      if (parsed.color) next.foreground = parsed.color;
      index += parsed.consumed;
    } else if (code === 39) next.foreground = undefined;
    else if (code != null && code >= 40 && code <= 47) {
      next.background = { kind: "standard", index: code - 40 };
    } else if (code === 48) {
      const parsed = extendedColor(parameters, index);
      if (parsed.color) next.background = parsed.color;
      index += parsed.consumed;
    } else if (code === 49) next.background = undefined;
    else if (code != null && code >= 90 && code <= 97) {
      next.foreground = { kind: "standard", index: code - 90 + 8 };
    } else if (code != null && code >= 100 && code <= 107) {
      next.background = { kind: "standard", index: code - 100 + 8 };
    }
  }
  return next;
}

function segmentsForCells(cells: readonly TerminalCell[]): AnsiTextSegment[] {
  const segments: AnsiTextSegment[] = [];
  for (const cell of cells) {
    const previous = segments.at(-1);
    if (previous && styleKey(previous.style) === cell.styleKey) {
      previous.text += cell.text;
    } else {
      segments.push({ text: cell.text, style: cloneStyle(cell.style) });
    }
  }
  return segments;
}

function flattenLines(lines: readonly AnsiLogLine[]): AnsiTextSegment[] {
  const segments: AnsiTextSegment[] = [];
  lines.forEach((line, index) => {
    if (index > 0) segments.push({ text: "\n", style: {} });
    for (const segment of line.segments) segments.push(segment);
  });
  return segments;
}

function linesForSegments(segments: readonly AnsiTextSegment[]): AnsiLogLine[] {
  const lines: AnsiLogLine[] = [{ text: "", segments: [] }];
  for (const segment of segments) {
    const parts = segment.text.split("\n");
    parts.forEach((part, index) => {
      const line = lines[lines.length - 1]!;
      if (part) {
        line.text += part;
        const previous = line.segments.at(-1);
        if (previous && styleKey(previous.style) === styleKey(segment.style)) {
          previous.text += part;
        } else {
          line.segments.push({ text: part, style: cloneStyle(segment.style) });
        }
      }
      if (index < parts.length - 1) lines.push({ text: "", segments: [] });
    });
  }
  return lines;
}

function findControlSequenceEnd(input: string, start: number): number {
  for (let index = start; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) return index;
  }
  return -1;
}

function findOperatingSystemCommandEnd(input: string, start: number): number {
  for (let index = start; index < input.length; index += 1) {
    if (input[index] === "\u0007") return index;
    if (input[index] === ESC && input[index + 1] === "\\") return index + 1;
  }
  return -1;
}

/** Keep a bounded raw tail without starting inside an ANSI control sequence. */
export function ansiRawTail(input: string, limit: number): string {
  if (limit <= 0) return "";
  if (input.length <= limit) return input;
  let start = input.length - limit;
  const escape = input.lastIndexOf(ESC, start);
  if (escape < 0 || escape === start) return input.slice(start);
  const introducer = input[escape + 1];
  if (introducer === "[") {
    const end = findControlSequenceEnd(input, escape + 2);
    if (end < 0) return "";
    if (end >= start) start = end + 1;
  } else if (introducer === "]") {
    const end = findOperatingSystemCommandEnd(input, escape + 2);
    if (end < 0) return "";
    if (end >= start) start = end + 1;
  } else if (escape + 1 >= start) {
    start = Math.min(input.length, escape + 2);
  }
  return input.slice(start);
}

/** Parse bounded terminal output into text-only, safely styled segments. */
export function parseAnsiLog(input: string): ParsedAnsiLog {
  const terminalLines: TerminalCell[][] = [[]];
  let column = 0;
  let style: AnsiTextStyle = {};

  const currentLine = () => terminalLines[terminalLines.length - 1]!;
  const writeCharacter = (text: string) => {
    const line = currentLine();
    while (line.length < column) {
      line.push({ text: " ", style: {}, styleKey: styleKey({}) });
    }
    const cell = {
      text,
      style: cloneStyle(style),
      styleKey: styleKey(style),
    };
    if (column < line.length) line[column] = cell;
    else line.push(cell);
    column += 1;
  };

  for (let index = 0; index < input.length; ) {
    const character = input[index]!;
    if (character === ESC) {
      const introducer = input[index + 1];
      if (introducer === "[") {
        const end = findControlSequenceEnd(input, index + 2);
        if (end < 0) break;
        const final = input[end]!;
        const parameters = input.slice(index + 2, end);
        if (final === "m") {
          style = applySgr(style, parameters);
        } else if (final === "K") {
          const mode = Number.parseInt(parameters || "0", 10);
          const line = currentLine();
          if (mode === 2) {
            line.length = 0;
            column = 0;
          } else if (mode === 1) {
            const limit = Math.min(column, line.length - 1);
            for (let cell = 0; cell <= limit; cell += 1) {
              line[cell] = { text: " ", style: {}, styleKey: styleKey({}) };
            }
          } else {
            line.splice(column);
          }
        }
        index = end + 1;
        continue;
      }
      if (introducer === "]") {
        const end = findOperatingSystemCommandEnd(input, index + 2);
        if (end < 0) break;
        index = end + 1;
        continue;
      }
      index += Math.min(2, input.length - index);
      continue;
    }
    if (character === "\n") {
      terminalLines.push([]);
      column = 0;
      index += 1;
      continue;
    }
    if (character === "\r") {
      column = 0;
      index += 1;
      continue;
    }
    if (character === "\b") {
      column = Math.max(0, column - 1);
      index += 1;
      continue;
    }
    if (character === "\t") {
      const nextTabStop = (Math.floor(column / 8) + 1) * 8;
      while (column < nextTabStop) writeCharacter(" ");
      index += 1;
      continue;
    }
    const characterCode = input.charCodeAt(index);
    if (characterCode < 0x20 || (characterCode >= 0x7f && characterCode <= 0x9f)) {
      index += 1;
      continue;
    }
    const codePoint = input.codePointAt(index)!;
    const text = String.fromCodePoint(codePoint);
    writeCharacter(text);
    index += text.length;
  }

  const lines = terminalLines.map((cells) => ({
    text: cells.map((cell) => cell.text).join(""),
    segments: segmentsForCells(cells),
  }));
  return {
    text: lines.map((line) => line.text).join("\n"),
    lines,
    segments: flattenLines(lines),
  };
}

/** Return a complete styled suffix without slicing ANSI/control sequences. */
export function ansiLogTail(
  parsed: ParsedAnsiLog,
  limit: number,
): ParsedAnsiLog {
  if (limit <= 0) return { text: "", lines: [{ text: "", segments: [] }], segments: [] };
  if (parsed.text.length <= limit) return parsed;
  let remaining = limit;
  const reversed: AnsiTextSegment[] = [];
  for (let index = parsed.segments.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const segment = parsed.segments[index]!;
    const text =
      segment.text.length <= remaining
        ? segment.text
        : segment.text.slice(segment.text.length - remaining);
    reversed.push({ text, style: cloneStyle(segment.style) });
    remaining -= text.length;
  }
  const segments = reversed.reverse();
  const text = segments.map((segment) => segment.text).join("");
  const lines = linesForSegments(segments);
  return { text, lines, segments };
}

export function lastMeaningfulAnsiLine(
  value: string | ParsedAnsiLog,
): AnsiLogLine {
  const parsed = typeof value === "string" ? parseAnsiLog(value) : value;
  for (let index = parsed.lines.length - 1; index >= 0; index -= 1) {
    const line = parsed.lines[index]!;
    if (line.text.trim()) return line;
  }
  return { text: "", segments: [] };
}

export function ansiColorToCss(color: AnsiColor): string {
  if (color.kind === "standard") {
    return ANSI_TERMINAL_PALETTE[color.index] ?? ANSI_TERMINAL_PALETTE[7];
  }
  if (color.kind === "rgb") {
    return `rgb(${clampByte(color.red)}, ${clampByte(color.green)}, ${clampByte(color.blue)})`;
  }
  const index = clampByte(color.index);
  if (index < 16) return ANSI_TERMINAL_PALETTE[index]!;
  if (index >= 232) {
    const channel = (index - 232) * 10 + 8;
    return `rgb(${channel}, ${channel}, ${channel})`;
  }
  const cube = index - 16;
  const component = (value: number) => (value === 0 ? 0 : value * 40 + 55);
  const red = component(Math.floor(cube / 36));
  const green = component(Math.floor((cube % 36) / 6));
  const blue = component(cube % 6);
  return `rgb(${red}, ${green}, ${blue})`;
}

/** Standard palette index when a compact, theme-safe mapping is available. */
export function compactAnsiColorIndex(
  color: AnsiColor | undefined,
): number | null {
  if (!color) return null;
  if (color.kind === "standard") return color.index;
  if (color.kind === "indexed" && color.index < 16) return color.index;
  return null;
}
