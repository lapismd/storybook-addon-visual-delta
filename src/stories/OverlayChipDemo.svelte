<script lang="ts">
  import { onMount } from "svelte";
  import type { PlacementMode } from "../constants.js";
  import { isSplitPlacement } from "../constants.js";
  import {
    ensureOverlayChip,
    isPreviewChipVisible,
  } from "../shared/preview-chip.js";

  /**
   * Mini live + baseline overlay for each placement. Uses the same
   * `ensureOverlayChip` helper as the preview overlay so split (left/right/
   * above/below) and center all show a Baseline chip on the overlay image.
   */
  type Props = {
    /** Placements to render (defaults to all five pad cells). */
    placements?: PlacementMode[];
  };

  const ALL_PLACEMENTS: PlacementMode[] = [
    "above",
    "left",
    "center",
    "right",
    "below",
  ];

  let { placements = ALL_PLACEMENTS }: Props = $props();

  let rootEl: HTMLDivElement | undefined = $state();
  let visibleCount = $state(0);

  function mountChips() {
    if (!rootEl) return;
    let visible = 0;
    for (const placement of placements) {
      const overlay = rootEl.querySelector<HTMLElement>(
        `[data-testid="demo-overlay-${placement}"]`,
      );
      if (!overlay) continue;
      const chip = ensureOverlayChip(overlay, {
        id: `visual-delta-demo-chip-${placement}`,
      });
      chip.setAttribute("data-placement", placement);
      if (isPreviewChipVisible(chip)) visible += 1;
    }
    visibleCount = visible;
  }

  onMount(() => {
    mountChips();
    const ro = new ResizeObserver(() => mountChips());
    if (rootEl) ro.observe(rootEl);
    return () => ro.disconnect();
  });

  $effect(() => {
    void placements;
    queueMicrotask(mountChips);
  });
</script>

<div
  class="chip-demo"
  bind:this={rootEl}
  data-testid="overlay-chip-demo"
  data-visible-chips={String(visibleCount)}
>
  <p class="hint">
    Baseline chip on the overlay image for every pad placement (split + center).
    Visible chips:
    <strong data-testid="visible-chip-count">{visibleCount}</strong>
  </p>
  <div class="grid">
    {#each placements as placement (placement)}
      {@const split = isSplitPlacement(placement)}
      {@const baselineFirst = placement === "left" || placement === "above"}
      {@const horizontal = placement === "left" || placement === "right"}
      <section
        class="cell"
        data-testid="chip-placement-{placement}"
        data-placement={placement}
      >
        <h3 class="label">{placement}</h3>
        {#if split}
          <div
            class="panes"
            class:horizontal
            class:vertical={!horizontal}
            aria-label="{placement} split"
          >
            {#if baselineFirst}
              <div class="pane baseline-pane" data-testid="demo-baseline-pane-{placement}">
                <div
                  class="overlay"
                  data-testid="demo-overlay-{placement}"
                  data-overlay-role="baseline"
                >
                  <div class="baseline-img" aria-hidden="true">Baseline PNG</div>
                </div>
              </div>
              <div class="pane live-pane" data-testid="demo-live-pane-{placement}">
                <div class="live-subject">Live</div>
              </div>
            {:else}
              <div class="pane live-pane" data-testid="demo-live-pane-{placement}">
                <div class="live-subject">Live</div>
              </div>
              <div class="pane baseline-pane" data-testid="demo-baseline-pane-{placement}">
                <div
                  class="overlay"
                  data-testid="demo-overlay-{placement}"
                  data-overlay-role="baseline"
                >
                  <div class="baseline-img" aria-hidden="true">Baseline PNG</div>
                </div>
              </div>
            {/if}
          </div>
        {:else}
          <div class="center-stage" data-testid="demo-center-stage">
            <div class="live-subject">Live</div>
            <div
              class="overlay center-overlay"
              data-testid="demo-overlay-{placement}"
              data-overlay-role="baseline"
            >
              <div class="baseline-img" aria-hidden="true">Baseline PNG</div>
            </div>
          </div>
        {/if}
      </section>
    {/each}
  </div>
</div>

<style>
  .chip-demo {
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

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .cell {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .label {
    margin: 0;
    font-size: 12px;
    font-weight: 650;
    text-transform: capitalize;
  }

  .panes {
    display: flex;
    gap: 1px;
    background: rgba(0, 0, 0, 0.12);
    min-height: 96px;
    border-radius: 4px;
    overflow: hidden;
  }

  .panes.horizontal {
    flex-direction: row;
  }

  .panes.vertical {
    flex-direction: column;
  }

  .pane {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    padding: 8px;
    box-sizing: border-box;
    background: var(--background, #fff);
  }

  .center-stage {
    position: relative;
    min-height: 96px;
    padding: 8px;
    box-sizing: border-box;
    background: var(--background, #fff);
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 4px;
  }

  .live-subject,
  .baseline-img {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 64px;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    box-sizing: border-box;
  }

  .live-subject {
    border: 1px dashed var(--border, #ccc);
    color: var(--foreground, #333);
  }

  .overlay {
    position: relative;
    width: max-content;
    height: max-content;
    max-width: 100%;
  }

  .center-overlay {
    position: absolute;
    top: 8px;
    left: 8px;
  }

  .baseline-img {
    width: 140px;
    border: 1px solid color-mix(in oklab, #0261c6 45%, #ccc);
    background: color-mix(in oklab, #0261c6 12%, #f4f7fb);
    color: #024a96;
  }

  /* Opacity on the stand-in PNG only — same as live overlay (chip stays solid). */
  .center-overlay .baseline-img {
    opacity: 0.92;
  }
</style>
