import { execFileSync } from "node:child_process";
import path from "node:path";

export const STORY_SOURCE_FILE_PATH_TOKEN = "{filePath}";

/**
 * A shell-free formatter that reads complete story source from stdin and
 * returns the formatted source on stdout.
 */
export type StorySourceFormatter = {
  command: string;
  args: string[];
};

export function storySourceFormatterCliArgs(
  formatter: StorySourceFormatter | undefined,
): string[] {
  if (!formatter) return [];
  return [
    "--story-source-formatter-command",
    formatter.command,
    ...formatter.args.flatMap((argument) => [
      "--story-source-formatter-arg",
      argument,
    ]),
  ];
}

function validatedFormatter(
  formatter: StorySourceFormatter,
): StorySourceFormatter {
  const command = formatter.command.trim();
  if (!command) {
    throw new Error("Story source formatter command must not be empty.");
  }
  if (
    !Array.isArray(formatter.args) ||
    formatter.args.some((argument) => typeof argument !== "string")
  ) {
    throw new Error("Story source formatter args must be an array of strings.");
  }
  if (
    !formatter.args.some((argument) =>
      argument.includes(STORY_SOURCE_FILE_PATH_TOKEN),
    )
  ) {
    throw new Error(
      `Story source formatter args must include ${STORY_SOURCE_FILE_PATH_TOKEN}.`,
    );
  }
  return { command, args: formatter.args };
}

function formatterFailureMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const stderr = "stderr" in error ? error.stderr : undefined;
  const stderrText =
    typeof stderr === "string"
      ? stderr.trim()
      : Buffer.isBuffer(stderr)
        ? stderr.toString("utf8").trim()
        : "";
  if (stderrText) return stderrText;
  return error instanceof Error ? error.message : String(error);
}

export function formatStorySource(options: {
  packageRoot: string;
  filePath: string;
  source: string;
  formatter?: StorySourceFormatter;
}): string {
  if (!options.formatter) return options.source;
  const formatter = validatedFormatter(options.formatter);
  const args = formatter.args.map((argument) =>
    argument.replaceAll(STORY_SOURCE_FILE_PATH_TOKEN, options.filePath),
  );
  try {
    const output = execFileSync(formatter.command, args, {
      cwd: options.packageRoot,
      input: options.source,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    if (options.source.length > 0 && output.length === 0) {
      throw new Error("formatter returned empty output");
    }
    return output;
  } catch (error) {
    const relative = path.relative(options.packageRoot, options.filePath);
    throw new Error(
      `Story source formatter failed for ${relative || path.basename(options.filePath)}: ${formatterFailureMessage(error)}`,
    );
  }
}
