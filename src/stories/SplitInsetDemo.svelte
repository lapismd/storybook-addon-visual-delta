<script lang="ts">
  import { onMount } from "svelte";
  import { baselinePanePaddingPx } from "../shared/compare-insets.js";

  /**
   * Mini split compare that applies the same inset math as the preview
   * overlay. Used by Storybook stories to visually lock alignment regressions
   * (canvas padding + subject margin → baseline pane padding).
   */
  type Props = {
    /**
     * Vertical margin on the live subject in px.
     * Mirrors Tailwind `my-2` (8px) used by Add Section Chooser.
     */
    subjectMarginYPx?: number;
    /** Horizontal margin on the live subject in px. */
    subjectMarginXPx?: number;
    /** Canvas padding in px (Storybook root default is 24). */
    canvasPaddingPx?: number;
  };

  let {
    subjectMarginYPx = 8,
    subjectMarginXPx = 0,
    canvasPaddingPx = 24,
  }: Props = $props();

  let canvasEl: HTMLDivElement | undefined = $state();
  let subjectEl: HTMLButtonElement | undefined = $state();
  let baselinePaneEl: HTMLDivElement | undefined = $state();
  let baselineSubjectEl: HTMLDivElement | undefined = $state();
  let livePaneEl: HTMLDivElement | undefined = $state();

  let deltaTop = $state(0);
  let deltaLeft = $state(0);
  let panePaddingTop = $state("");

  function sync() {
    if (
      !canvasEl ||
      !subjectEl ||
      !baselinePaneEl ||
      !baselineSubjectEl ||
      !livePaneEl
    ) {
      return;
    }
    const pad = baselinePanePaddingPx(
      getComputedStyle(canvasEl),
      getComputedStyle(subjectEl),
    );
    baselinePaneEl.style.paddingTop = `${pad.top}px`;
    baselinePaneEl.style.paddingRight = `${pad.right}px`;
    baselinePaneEl.style.paddingBottom = `${pad.bottom}px`;
    baselinePaneEl.style.paddingLeft = `${pad.left}px`;
    panePaddingTop = `${pad.top}px`;

    const subjectRect = subjectEl.getBoundingClientRect();
    const baselineRect = baselineSubjectEl.getBoundingClientRect();
    const livePaneRect = livePaneEl.getBoundingClientRect();
    const basePaneRect = baselinePaneEl.getBoundingClientRect();
    deltaTop =
      subjectRect.top -
      livePaneRect.top -
      (baselineRect.top - basePaneRect.top);
    deltaLeft =
      subjectRect.left -
      livePaneRect.left -
      (baselineRect.left - basePaneRect.left);
  }

  onMount(() => {
    sync();
    const ro = new ResizeObserver(() => sync());
    if (canvasEl) ro.observe(canvasEl);
    if (subjectEl) ro.observe(subjectEl);
    return () => ro.disconnect();
  });

  $effect(() => {
    void subjectMarginYPx;
    void subjectMarginXPx;
    void canvasPaddingPx;
    queueMicrotask(sync);
  });
</script>

<div
  class="split-demo"
  data-testid="split-inset-demo"
  data-delta-top={deltaTop.toFixed(2)}
  data-delta-left={deltaLeft.toFixed(2)}
  data-pane-padding-top={panePaddingTop}
>
  <p class="hint">
    Live (left) vs baseline stand-in (right). Tops should match after inset
    sync. Δ top
    <strong data-testid="delta-top">{deltaTop.toFixed(2)}</strong>
    · pane padding-top
    <strong data-testid="pane-padding-top">{panePaddingTop || "—"}</strong>
  </p>
  <div class="panes" role="group" aria-label="Split inset compare demo">
    <div class="pane live-pane" bind:this={livePaneEl} data-testid="live-pane">
      <div
        class="canvas"
        bind:this={canvasEl}
        data-testid="live-canvas"
        style:padding="{canvasPaddingPx}px"
      >
        <button
          type="button"
          class="subject"
          bind:this={subjectEl}
          data-testid="live-subject"
          style:margin-top="{subjectMarginYPx}px"
          style:margin-bottom="{subjectMarginYPx}px"
          style:margin-left="{subjectMarginXPx}px"
          style:margin-right="{subjectMarginXPx}px"
        >
          Add New Section
        </button>
      </div>
    </div>
    <div
      class="pane baseline-pane"
      bind:this={baselinePaneEl}
      data-testid="baseline-pane"
    >
      <div
        class="baseline-subject"
        bind:this={baselineSubjectEl}
        data-testid="baseline-subject"
        aria-hidden="true"
      >
        Add New Section
      </div>
    </div>
  </div>
</div>

<style>
  .split-demo {
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

  .panes {
    display: flex;
    flex-direction: row;
    gap: 1px;
    background: rgba(0, 0, 0, 0.12);
    min-height: 120px;
  }

  .pane {
    flex: 1 1 0;
    min-width: 0;
    overflow: auto;
    background: var(--background, #fff);
    box-sizing: border-box;
  }

  .canvas {
    box-sizing: border-box;
    min-height: 100%;
  }

  .subject,
  .baseline-subject {
    display: flex;
    width: 100%;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    border: 1px dashed var(--border, #ccc);
    border-radius: 0.5rem;
    background: transparent;
    font-size: 0.875rem;
    color: var(--foreground, #333);
  }

  .baseline-subject {
    /* Stand-in for a component-clipped baseline PNG (no margin of its own). */
    pointer-events: none;
    background: color-mix(in oklab, var(--muted, #eee) 55%, transparent);
  }
</style>
