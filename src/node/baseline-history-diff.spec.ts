import { describe, expect, it } from "vitest";
import { parseBaselineComponentDiff } from "./baseline-history-diff.js";

const PATCH = `diff --git a/src/component/Card.svelte b/src/component/Card.svelte
index 1111111..2222222 100644
--- a/src/component/Card.svelte
+++ b/src/component/Card.svelte
@@ -1,3 +1,3 @@
 <div>
-  <span>Before</span>
+  <strong>After</strong>
 </div>
diff --git a/tests/visual/card.png b/tests/visual/card.png
index 3333333..4444444 100644
Binary files a/tests/visual/card.png and b/tests/visual/card.png differ
diff --git a/src/other/Other.tsx b/src/other/Other.tsx
index 5555555..6666666 100644
--- a/src/other/Other.tsx
+++ b/src/other/Other.tsx
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`;

describe("parseBaselineComponentDiff", () => {
  it("creates aligned split rows and ignores binary files", () => {
    const result = parseBaselineComponentDiff(PATCH);

    expect(result.truncated).toBe(false);
    expect(result.files.map((file) => file.afterPath)).toEqual([
      "src/component/Card.svelte",
      "src/other/Other.tsx",
    ]);
    expect(result.files[0]).toMatchObject({
      beforePath: "src/component/Card.svelte",
      afterPath: "src/component/Card.svelte",
    });
    expect(result.files[0]?.hunks[0]?.header).toBe("@@ -1,3 +1,3 @@");
    expect(result.files[0]?.hunks[0]?.lines.slice(0, 2)).toEqual([
      {
        beforeNumber: 1,
        afterNumber: 1,
        before: "<div>",
        after: "<div>",
        kind: "context",
      },
      {
        beforeNumber: 2,
        afterNumber: 2,
        before: "  <span>Before</span>",
        after: "  <strong>After</strong>",
        kind: "changed",
      },
    ]);
  });

  it("limits the result to the story component directory", () => {
    const result = parseBaselineComponentDiff(
      PATCH,
      "src/component/Card.stories.svelte",
    );

    expect(result.files.map((file) => file.afterPath)).toEqual([
      "src/component/Card.svelte",
    ]);
  });
});
