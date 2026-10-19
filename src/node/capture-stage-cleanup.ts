import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type CleanupIo = {
  remove?: (directory: string) => void;
  runContainer?: (args: string[]) => void;
};

const emptyStage = `import { readdirSync, rmSync } from "node:fs";
for (const entry of readdirSync("/cleanup")) {
  rmSync("/cleanup/" + entry, { recursive: true, force: true });
}`;

export function cleanupCaptureStage(
  directory: string,
  image: string | null,
  {
    remove = (target) => rmSync(target, { recursive: true, force: true }),
    runContainer = (args) => {
      execFileSync("docker", args, { stdio: "pipe" });
    },
  }: CleanupIo = {},
): void {
  try {
    remove(directory);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "EACCES" && code !== "EPERM") throw error;
    const stage = realpathSync(directory);
    if (
      lstatSync(directory).isSymbolicLink() ||
      !lstatSync(directory).isDirectory() ||
      path.dirname(stage) !== realpathSync(tmpdir()) ||
      !/^visual-delta-capture-.+$/.test(path.basename(stage)) ||
      typeof image !== "string" ||
      !/@sha256:[a-f0-9]{64}$/.test(image)
    ) {
      throw new Error(
        "Refusing container cleanup outside an isolated capture stage",
        { cause: error },
      );
    }
    runContainer([
      "run",
      "--rm",
      "--init",
      "--platform",
      "linux/arm64",
      "--network=none",
      "--read-only",
      "--security-opt=no-new-privileges",
      "--mount",
      `type=bind,src=${stage},dst=/cleanup`,
      image,
      "node",
      "--input-type=module",
      "-e",
      emptyStage,
    ]);
    remove(directory);
  }
}
