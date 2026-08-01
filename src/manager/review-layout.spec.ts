import { afterEach, describe, expect, it, vi } from "vitest";
import { PANEL_ID } from "../constants.js";
import {
  enterReviewLayout,
  exitReviewLayout,
  isReviewLayoutActive,
  toggleReviewLayout,
  type ReviewLayoutApi,
  type ReviewLayoutSource,
} from "./review-layout.js";

function layout(
  overrides: Partial<ReviewLayoutSource> = {},
): ReviewLayoutSource {
  return {
    navSize: 300,
    bottomPanelHeight: 280,
    rightPanelWidth: 400,
    panelPosition: "right",
    showToolbar: true,
    recentVisibleSizes: {
      navSize: 300,
      bottomPanelHeight: 280,
      rightPanelWidth: 400,
    },
    ...overrides,
  };
}

function mockApi(): ReviewLayoutApi & {
  calls: Record<string, unknown[][]>;
} {
  const calls: Record<string, unknown[][]> = {
    toggleNav: [],
    togglePanel: [],
    togglePanelPosition: [],
    setSelectedPanel: [],
    setSizes: [],
  };
  return {
    calls,
    toggleNav: (toggled) => {
      calls.toggleNav.push([toggled]);
    },
    togglePanel: (toggled) => {
      calls.togglePanel.push([toggled]);
    },
    togglePanelPosition: (position) => {
      calls.togglePanelPosition.push([position]);
    },
    setSelectedPanel: (panelName) => {
      calls.setSelectedPanel.push([panelName]);
    },
    setSizes: (options) => {
      calls.setSizes.push([options]);
    },
  };
}

function installMobileAddonDrawer(initiallyOpen: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 599px)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );

  const openButton = document.createElement("button");
  openButton.setAttribute("aria-controls", "storybook-mobile-addon-panel");
  openButton.setAttribute("aria-expanded", "false");

  const openDrawer = () => {
    openButton.remove();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Addon panel");
    const closeButton = document.createElement("button");
    closeButton.setAttribute("aria-label", "Close addon panel");
    closeButton.addEventListener("click", () => {
      dialog.remove();
      document.body.append(openButton);
    });
    dialog.append(closeButton);
    document.body.append(dialog);
  };

  openButton.addEventListener("click", openDrawer);
  if (initiallyOpen) openDrawer();
  else document.body.append(openButton);
}

afterEach(() => {
  if (isReviewLayoutActive()) {
    exitReviewLayout(mockApi());
  }
  vi.useRealTimers();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("review-layout", () => {
  it("enters review layout without fullscreen or toolbar toggle", () => {
    const api = mockApi();
    vi.stubGlobal("innerHeight", 1000);

    enterReviewLayout(api, layout());

    expect(isReviewLayoutActive()).toBe(true);
    expect(api.calls.toggleNav).toEqual([[false]]);
    expect(api.calls.togglePanelPosition).toEqual([["bottom"]]);
    expect(api.calls.togglePanel).toEqual([[true]]);
    expect(api.calls.setSelectedPanel).toEqual([[PANEL_ID]]);
    expect(api.calls.setSizes).toEqual([[{ bottomPanelHeight: 420 }]]);
  });

  it("restores prior layout on exit without changing the selected panel", () => {
    vi.useFakeTimers();
    const api = mockApi();
    enterReviewLayout(api, layout());
    const exitApi = mockApi();
    exitReviewLayout(exitApi);

    expect(isReviewLayoutActive()).toBe(false);
    expect(exitApi.calls.togglePanelPosition).toEqual([["right"]]);
    expect(exitApi.calls.setSelectedPanel).toEqual([]);
    expect(exitApi.calls.setSizes).toEqual([
      [
        {
          navSize: 0,
          bottomPanelHeight: 280,
          rightPanelWidth: 400,
        },
      ],
    ]);
    expect(exitApi.calls.toggleNav).toEqual([]);
    expect(exitApi.calls.togglePanel).toEqual([]);

    vi.advanceTimersByTime(50);
    expect(exitApi.calls.setSizes).toEqual([
      [
        {
          navSize: 0,
          bottomPanelHeight: 280,
          rightPanelWidth: 400,
        },
      ],
      [{ navSize: 300 }],
    ]);
    vi.useRealTimers();
  });

  it("hides nav and panel again when they were hidden before enter", () => {
    vi.useFakeTimers();
    const api = mockApi();
    enterReviewLayout(
      api,
      layout({
        navSize: 0,
        bottomPanelHeight: 0,
        rightPanelWidth: 0,
        panelPosition: "bottom",
      }),
    );
    const exitApi = mockApi();
    exitReviewLayout(exitApi);

    expect(exitApi.calls.setSizes).toEqual([
      [
        {
          navSize: 0,
          bottomPanelHeight: 0,
          rightPanelWidth: 400,
        },
      ],
    ]);
    expect(exitApi.calls.togglePanel).toEqual([[false]]);

    vi.advanceTimersByTime(50);
    expect(exitApi.calls.toggleNav).toEqual([[false]]);
    vi.useRealTimers();
  });

  it("toggles enter and exit", () => {
    const api = mockApi();
    expect(toggleReviewLayout(api, layout())).toBe(true);
    expect(isReviewLayoutActive()).toBe(true);
    expect(toggleReviewLayout(api, layout())).toBe(false);
    expect(isReviewLayoutActive()).toBe(false);
  });

  it("opens and restores a mobile addon drawer that started closed", () => {
    vi.useFakeTimers();
    installMobileAddonDrawer(false);

    enterReviewLayout(mockApi(), layout());
    vi.runAllTimers();

    expect(
      document.querySelector('[role="dialog"][aria-label="Addon panel"]'),
    ).not.toBeNull();

    exitReviewLayout(mockApi());
    vi.runAllTimers();

    expect(
      document.querySelector('[role="dialog"][aria-label="Addon panel"]'),
    ).toBeNull();
    expect(
      document.querySelector(
        '[aria-controls="storybook-mobile-addon-panel"][aria-expanded="false"]',
      ),
    ).not.toBeNull();
  });

  it("leaves a mobile addon drawer open when it was open before review", () => {
    vi.useFakeTimers();
    installMobileAddonDrawer(true);

    enterReviewLayout(mockApi(), layout());
    vi.runAllTimers();
    exitReviewLayout(mockApi());
    vi.runAllTimers();

    expect(
      document.querySelector('[role="dialog"][aria-label="Addon panel"]'),
    ).not.toBeNull();
  });
});
