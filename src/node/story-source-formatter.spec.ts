import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatStorySource,
  storySourceFormatterCliArgs,
  type StorySourceFormatter,
} from "./story-source-formatter.js";

const passthroughScript = `
let source = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { source += chunk; });
process.stdin.on("end", () => {
  process.stdout.write("// formatted " + process.argv[1] + "\\n" + source);
});
`;

describe("story source formatter", () => {
  it("substitutes the exact filepath and formats through stdin/stdout", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vd-source-formatter-"));
    try {
      const filePath = path.join(root, "src/demo.stories.ts");
      const result = formatStorySource({
        packageRoot: root,
        filePath,
        source: "export const Demo = {};\n",
        formatter: {
          command: process.execPath,
          args: ["-e", passthroughScript, "{filePath}"],
        },
      });

      expect(result).toBe(
        `// formatted ${filePath}\nexport const Demo = {};\n`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a formatter without filepath context", () => {
    expect(() =>
      formatStorySource({
        packageRoot: "/workspace",
        filePath: "/workspace/demo.stories.ts",
        source: "export const Demo = {};\n",
        formatter: { command: process.execPath, args: ["-e", ""] },
      }),
    ).toThrow("must include {filePath}");
  });

  it("forwards a formatter through repeatable CLI arguments", () => {
    const formatter: StorySourceFormatter = {
      command: "pnpm",
      args: ["exec", "prettier", "--stdin-filepath", "{filePath}"],
    };
    expect(storySourceFormatterCliArgs(formatter)).toEqual([
      "--story-source-formatter-command",
      "pnpm",
      "--story-source-formatter-arg",
      "exec",
      "--story-source-formatter-arg",
      "prettier",
      "--story-source-formatter-arg",
      "--stdin-filepath",
      "--story-source-formatter-arg",
      "{filePath}",
    ]);
  });
});
