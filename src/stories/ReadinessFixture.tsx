import React from "react";

export function ReadinessSubject() {
  return (
    <div data-testid="delayed-missing-subject">
      Delayed story without a baseline
      <button type="button" data-testid="finish-delayed-play">
        Finish delayed play
      </button>
    </div>
  );
}

export async function waitForReadinessRelease(canvasElement: HTMLElement) {
  const finish = canvasElement.querySelector<HTMLButtonElement>(
    '[data-testid="finish-delayed-play"]',
  );
  if (!finish) throw new Error("Missing readiness completion control");
  await new Promise<void>((resolve) => {
    finish.addEventListener("click", () => resolve(), { once: true });
    canvasElement.dataset.visualDeltaDelayedMissing = "pending";
  });
  canvasElement.dataset.visualDeltaDelayedMissing = "complete";
}
