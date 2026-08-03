import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  persistCanonicalBuildCache,
  resolveCanonicalBuildCacheRoot,
  restoreCanonicalBuildCache,
} from "./canonical-build-cache.js";

const roots: string[] = [];

function fixture(): { root: string; cacheRoot: string } {
  const root = mkdtempSync(path.join(tmpdir(), "visual-delta-build-cache-"));
  roots.push(root);
  const cacheRoot = path.join(root, ".visual-delta/cache/canonical-build");
  mkdirSync(path.join(root, "storybook-static/assets"), { recursive: true });
  mkdirSync(path.join(root, ".visual-delta/cache"), { recursive: true });
  writeFileSync(path.join(root, "storybook-static/index.json"), "index-one");
  writeFileSync(path.join(root, "storybook-static/iframe.html"), "iframe-one");
  writeFileSync(path.join(root, "storybook-static/assets/app.js"), "asset-one");
  writeFileSync(
    path.join(root, ".visual-delta/cache/preview-stats.json"),
    '{"modules":[]}',
  );
  return { root, cacheRoot };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("canonical Storybook build cache", () => {
  it("uses the project cache by default and honors the runner mount override", () => {
    const current = fixture();
    expect(resolveCanonicalBuildCacheRoot(current.root, {})).toBe(
      path.join(current.root, ".visual-delta/cache/canonical-build"),
    );
    expect(
      resolveCanonicalBuildCacheRoot(current.root, {
        VISUAL_DELTA_CANONICAL_BUILD_CACHE: "/mounted/cache",
      }),
    ).toBe("/mounted/cache");
  });

  it("round-trips a checksum-verified complete static build", () => {
    const current = fixture();
    expect(
      persistCanonicalBuildCache({
        ...current,
        fingerprint: "render-one",
        profileId: "profile-one",
      }),
    ).toBe(true);

    writeFileSync(path.join(current.root, "storybook-static/index.json"), "stale");
    writeFileSync(
      path.join(current.root, ".visual-delta/cache/preview-stats.json"),
      "stale",
    );
    expect(
      restoreCanonicalBuildCache({
        ...current,
        fingerprint: "render-one",
        profileId: "profile-one",
      }),
    ).toEqual({ restored: true, reason: "hit" });
    expect(
      readFileSync(path.join(current.root, "storybook-static/index.json"), "utf8"),
    ).toBe("index-one");
    expect(
      readFileSync(
        path.join(current.root, ".visual-delta/cache/preview-stats.json"),
        "utf8",
      ),
    ).toBe('{"modules":[]}');
    expect(
      statSync(path.join(current.root, "storybook-static/index.json")).mode &
        0o777,
    ).toBe(0o644);
  });

  it("normalizes restored static files to readable permissions", () => {
    const current = fixture();
    persistCanonicalBuildCache({
      ...current,
      fingerprint: "render-one",
      profileId: "profile-one",
    });
    chmodSync(
      path.join(
        current.cacheRoot,
        "entries/render-one/storybook-static/index.json",
      ),
      0o600,
    );

    expect(
      restoreCanonicalBuildCache({
        ...current,
        fingerprint: "render-one",
        profileId: "profile-one",
      }),
    ).toEqual({ restored: true, reason: "hit" });
    expect(
      statSync(path.join(current.root, "storybook-static/index.json")).mode &
        0o777,
    ).toBe(0o644);
  });

  it("does not restore a stale fingerprint or forced rebuild", () => {
    const current = fixture();
    persistCanonicalBuildCache({
      ...current,
      fingerprint: "render-one",
      profileId: "profile-one",
    });
    expect(
      restoreCanonicalBuildCache({
        ...current,
        fingerprint: "render-two",
        profileId: "profile-one",
      }),
    ).toEqual({ restored: false, reason: "missing" });
    expect(
      restoreCanonicalBuildCache({
        ...current,
        fingerprint: "render-one",
        profileId: "profile-one",
        forceRebuild: true,
      }),
    ).toEqual({ restored: false, reason: "forced-rebuild" });
  });

  it("rejects corrupt, partial, and mismatched-profile entries", () => {
    const current = fixture();
    persistCanonicalBuildCache({
      ...current,
      fingerprint: "render-one",
      profileId: "profile-one",
    });
    expect(
      restoreCanonicalBuildCache({
        ...current,
        fingerprint: "render-one",
        profileId: "profile-two",
      }).reason,
    ).toBe("invalid");

    writeFileSync(
      path.join(
        current.cacheRoot,
        "entries/render-one/storybook-static/assets/app.js",
      ),
      "corrupt",
    );
    expect(
      restoreCanonicalBuildCache({
        ...current,
        fingerprint: "render-one",
        profileId: "profile-one",
      }).reason,
    ).toBe("invalid");
  });

  it("retains the active entry and at most one previous complete build", () => {
    const current = fixture();
    for (const fingerprint of ["1".repeat(64), "2".repeat(64), "3".repeat(64)]) {
      expect(
        persistCanonicalBuildCache({
          ...current,
          fingerprint,
          profileId: "profile-one",
        }),
      ).toBe(true);
    }
    const entries = readdirSync(path.join(current.cacheRoot, "entries"));
    expect(entries).toHaveLength(2);
    expect(entries).toContain("3".repeat(64));
  });
});
