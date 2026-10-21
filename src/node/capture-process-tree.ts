import { execFileSync } from "node:child_process";

/** Capture owned groups before signalling parents, including detached tools. */
export function captureProcessGroups(pid: number): number[] {
  try {
    const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,pgid="], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number));
    const owned = new Set([pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [child, parent] of rows)
        if (parent && child && owned.has(parent) && !owned.has(child)) {
          owned.add(child);
          changed = true;
        }
    }
    return [
      ...new Set([
        pid,
        ...rows
          .filter(([child]) => child && owned.has(child))
          .map(([, , group]) => group!)
          .filter((group) => owned.has(group)),
      ]),
    ].reverse();
  } catch {
    return [pid];
  }
}
