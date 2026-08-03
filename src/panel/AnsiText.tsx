import React, { type CSSProperties } from "react";
import { useTheme, type Theme } from "storybook/theming";
import {
  ansiColorToCss,
  compactAnsiColorIndex,
  type AnsiColor,
  type AnsiTextSegment,
  type AnsiTextStyle,
} from "../shared/ansi-log.js";

export type AnsiTextVariant = "terminal" | "compact";

function compactForeground(index: number, theme: Theme): string {
  switch (index % 8) {
    case 1:
      return theme.color.negative;
    case 2:
      return theme.color.positive;
    case 3:
      return theme.color.gold;
    case 4:
    case 5:
    case 6:
      return theme.color.secondary;
    case 0:
      return index >= 8 ? theme.textMutedColor : theme.color.defaultText;
    default:
      return theme.color.defaultText;
  }
}

function textDecoration(style: AnsiTextStyle): string | undefined {
  const decorations = [
    style.underline ? "underline" : null,
    style.strikethrough ? "line-through" : null,
  ].filter(Boolean);
  return decorations.length > 0 ? decorations.join(" ") : undefined;
}

function terminalStyle(style: AnsiTextStyle): CSSProperties {
  let color = style.foreground
    ? ansiColorToCss(style.foreground)
    : undefined;
  let backgroundColor = style.background
    ? ansiColorToCss(style.background)
    : undefined;
  if (style.inverse) {
    const foregroundBeforeInverse = color ?? "#c8cdd5";
    color = backgroundColor ?? "#0f1115";
    backgroundColor = foregroundBeforeInverse;
  }
  return {
    color,
    backgroundColor,
    fontWeight: style.bold ? 700 : undefined,
    opacity: style.dim ? 0.7 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    textDecoration: textDecoration(style),
  };
}

function compactStyle(style: AnsiTextStyle, theme: Theme): CSSProperties {
  const foreground = compactAnsiColorIndex(style.foreground);
  return {
    color:
      foreground == null ? undefined : compactForeground(foreground, theme),
    fontWeight: style.bold ? 700 : undefined,
    opacity: style.dim ? 0.72 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    textDecoration: textDecoration(style),
  };
}

function colorLabel(color: AnsiColor | undefined): string | undefined {
  if (!color) return undefined;
  if (color.kind === "rgb") {
    return `rgb-${color.red}-${color.green}-${color.blue}`;
  }
  return `${color.kind}-${color.index}`;
}

export function AnsiText({
  segments,
  variant,
}: {
  segments: readonly AnsiTextSegment[];
  variant: AnsiTextVariant;
}) {
  const theme = useTheme();
  return (
    <>
      {segments.map((segment, index) => (
        <span
          // Logs are append-only presentation data; the index is stable for a render.
          key={index}
          data-ansi-foreground={colorLabel(segment.style.foreground)}
          data-ansi-background={colorLabel(segment.style.background)}
          data-ansi-inverse={segment.style.inverse || undefined}
          style={
            variant === "terminal"
              ? terminalStyle(segment.style)
              : compactStyle(segment.style, theme)
          }
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}
