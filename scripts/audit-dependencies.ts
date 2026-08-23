export type LockedNpmPackage = { name: string; version: string };

export function lockedNpmPackages(lock: {
  npm?: Record<string, unknown>;
}): LockedNpmPackage[] {
  return Object.keys(lock.npm ?? {}).map((key) => {
    const searchFrom = key.startsWith("@") ? key.indexOf("/") + 1 : 1;
    const separator = key.indexOf("@", searchFrom);
    const version = key.slice(separator + 1).split("_", 1)[0];
    if (separator <= 0 || !version) {
      throw new Error("Unsupported npm lock entry: " + key);
    }
    return {
      name: key.slice(0, separator),
      version,
    };
  });
}

if (import.meta.main) {
  const lock = JSON.parse(Deno.readTextFileSync("deno.lock")) as {
    npm?: Record<string, unknown>;
  };
  const packages = lockedNpmPackages(lock);
  const response = await fetch("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      queries: packages.map((entry) => ({
        package: { ecosystem: "npm", name: entry.name },
        version: entry.version,
      })),
    }),
  });
  if (!response.ok) {
    throw new Error("OSV query failed with HTTP " + response.status);
  }
  const payload = await response.json() as {
    results?: Array<{ vulns?: Array<{ id?: string; summary?: string }> }>;
  };
  const vulnerable = packages.flatMap((entry, index) =>
    (payload.results?.[index]?.vulns ?? []).map((vulnerability) => ({
      ...entry,
      id: vulnerability.id ?? "unknown",
      summary: vulnerability.summary ?? "no summary",
    }))
  );
  if (vulnerable.length > 0) {
    for (const entry of vulnerable) {
      console.error(
        entry.name + "@" + entry.version + ": " + entry.id + " " +
          entry.summary,
      );
    }
    Deno.exit(1);
  }
  console.log(
    "OSV audit passed for " + packages.length + " locked npm packages.",
  );
}
