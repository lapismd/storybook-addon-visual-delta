import { lockedNpmPackages } from "./audit-dependencies.ts";

Deno.test("extracts scoped and unscoped npm identities from a Deno lock", () => {
  const actual = lockedNpmPackages({
    npm: {
      "react@19.2.8": {},
      "@scope/pkg@1.2.3_peer@4.0.0": {},
      "@types/babel__core@7.20.5": {},
    },
  });
  if (
    JSON.stringify(actual) !==
      JSON.stringify([
        { name: "react", version: "19.2.8" },
        { name: "@scope/pkg", version: "1.2.3" },
        { name: "@types/babel__core", version: "7.20.5" },
      ])
  ) {
    throw new Error("unexpected locked package extraction");
  }
});

Deno.test("rejects malformed npm lock identities", () => {
  let rejected = false;
  try {
    lockedNpmPackages({ npm: { malformed: {} } });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("malformed lock identity was accepted");
});
