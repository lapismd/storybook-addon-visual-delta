import { expect, type Locator } from "@playwright/test";

/** Placement replaces chip nodes; observe both current boxes in one retry. */
export async function expectCapturedChipOrder(
  actualChip: Locator,
  baselineChip: Locator,
): Promise<void> {
  await expect(async () => {
    const [actualChipBox, baselineChipBox] = await Promise.all([
      actualChip.boundingBox(),
      baselineChip.boundingBox(),
    ]);
    expect(actualChipBox).not.toBeNull();
    expect(baselineChipBox).not.toBeNull();
    expect(actualChipBox!.x).toBeGreaterThan(baselineChipBox!.x);
  }).toPass();
}
