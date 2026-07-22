<script lang="ts">
  import type { PlacementMode } from "../constants.js";
  import {
    placementToggleAction,
    revealCenteredOverlayPatch,
    type OverlaySessionSnapshot,
  } from "../shared/overlay-session.js";

  /**
   * Interactive demo of placement soft-hide + post-update center reveal.
   * Uses the same pure helpers as the Visual Delta panel.
   */
  let session = $state<OverlaySessionSnapshot>({
    overlayOn: true,
    placement: "left",
    index: 0,
    imageCount: 1,
    opacity: 1,
  });

  let lastAction = $state("show left");

  const placements: PlacementMode[] = [
    "above",
    "left",
    "center",
    "right",
    "below",
  ];

  function toggle(placement: PlacementMode) {
    const action = placementToggleAction(session, placement);
    if (action.type === "soft-hide") {
      // Keep index — clearing it is the jump regression.
      session = { ...session, overlayOn: false };
      lastAction = `soft-hide (index=${session.index})`;
      return;
    }
    session = {
      ...session,
      overlayOn: action.index >= 0,
      placement: action.placement,
      index: action.index,
      opacity: action.opacity,
    };
    lastAction = `show ${action.placement}`;
  }

  function revealCenter() {
    const patch = revealCenteredOverlayPatch({
      index: session.index,
      imageCount: session.imageCount,
      placement: session.placement,
      opacity: session.opacity,
    });
    session = {
      ...session,
      overlayOn: patch.overlayOn,
      placement: patch.placement,
      index: patch.index,
      opacity: patch.opacity,
    };
    lastAction = "reveal-center";
  }
</script>

<div class="session-demo" data-testid="overlay-session-demo">
  <p class="hint">
    Soft-hide keeps the selected baseline index so split layout / width lock
    stay put. Reveal center mimics post create/update.
  </p>
  <div class="pad" role="group" aria-label="Placement pad demo">
    {#each placements as placement (placement)}
      <button
        type="button"
        data-testid="place-{placement}"
        aria-pressed={session.overlayOn && session.placement === placement}
        onclick={() => toggle(placement)}
      >
        {placement}
      </button>
    {/each}
    <button type="button" data-testid="reveal-center" onclick={revealCenter}>
      Reveal center
    </button>
  </div>
  <dl class="status" data-testid="session-status">
    <div>
      <dt>overlayOn</dt>
      <dd data-testid="overlay-on">{String(session.overlayOn)}</dd>
    </div>
    <div>
      <dt>placement</dt>
      <dd data-testid="placement">{session.placement}</dd>
    </div>
    <div>
      <dt>index</dt>
      <dd data-testid="index">{session.index}</dd>
    </div>
    <div>
      <dt>opacity</dt>
      <dd data-testid="opacity">{session.opacity}</dd>
    </div>
    <div>
      <dt>lastAction</dt>
      <dd data-testid="last-action">{lastAction}</dd>
    </div>
  </dl>
</div>

<style>
  .session-demo {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }

  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--foreground, #333);
  }

  .pad {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .pad button {
    font-size: 12px;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border, #ccc);
    border-radius: 4px;
    background: var(--background, #fff);
    cursor: pointer;
  }

  .pad button[aria-pressed="true"] {
    background: color-mix(in oklab, #0261c6 18%, transparent);
    border-color: #0261c6;
  }

  .status {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.5rem;
    margin: 0;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .status div {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border, #e5e5e5);
    border-radius: 4px;
  }

  .status dt {
    margin: 0;
    color: var(--muted-foreground, #666);
    font-weight: 500;
  }

  .status dd {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      monospace;
  }
</style>
