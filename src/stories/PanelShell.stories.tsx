import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { PanelShell } from "./PanelShell.js";
import { createMockVisualBackend } from "./mock-visual-backend.js";
import { ResponsiveViewportCanary } from "./ResponsiveViewportCanary.js";
import { ThemeHost } from "./ThemeHost.js";

const meta = {
  title: "Visual Delta/Panel Shell",
  tags: ["test", "skip-visual", "visual-delta-self-test"],
  parameters: {
    docs: {
      description: {
        component: [
          "Live-panel-shaped harness with in-memory create/update/run/review/skip-visual mocks.",
          "Click through or rely on play functions — no Playwright writes.",
          "See **Panel Shell/Guidance** for usage context and Spec links (`VD-UI-*`, `VD-RUN-*`, `VD-MUT-*`).",
          "Normative: Visual Delta/Specification → Panel and preview.",
        ].join(" "),
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  name: "Overview",
  render: () => (
    <ThemeHost>
      <PanelShell {...({ backend: createMockVisualBackend() })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByTestId("panel-shell"));
    await expect(canvas.getByTestId("panel-shell")).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Choose Story, Component, Affected, or All",
      }),
    );
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", {
        name: "Use Affected",
      }),
    );
    await expect(
      canvas.getByRole("button", {
        name: "Run only affected visual tests",
      }),
    ).toBeInTheDocument();
  },
};

export const SetupRequired: Story = {
  name: "Setup required",
  render: () => (
    <ThemeHost>
      <PanelShell {...({ backend: createMockVisualBackend(), seedEmpty: true, initialState: "setup" })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("status", { name: /Setup required/i }),
    ).toHaveAttribute("data-result-state", "setup");
  },
};

export const SkippedResult: Story = {
  name: "Skipped result",
  render: () => (
    <ThemeHost>
      <PanelShell {...({ backend: createMockVisualBackend(), initialSkipVisual: true })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("status", { name: /Visual tests skipped/i }),
    ).toHaveAttribute("data-result-state", "skipped");
  },
};

export const FailedResult: Story = {
  name: "Failed result",
  render: () => (
    <ThemeHost>
      <PanelShell {...({ backend: createMockVisualBackend(), initialState: "failed" })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("status", { name: /Visual test failed/i }),
    ).toHaveAttribute("data-result-state", "failed");
  },
};

export const PassedResult: Story = {
  name: "Passed result",
  render: () => (
    <ThemeHost>
      <PanelShell {...({ backend: createMockVisualBackend(), initialState: "passed" })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("status", { name: /Visual test passed/i }),
    ).toHaveAttribute("data-result-state", "passed");
  },
};

export const RunningResult: Story = {
  name: "Running result",
  render: () => (
    <ThemeHost>
      <PanelShell {...({
        backend: createMockVisualBackend(),
        initialState: "running",
        initialProgress: { completed: 7, total: 12 },
        initialStatusLog:
          "Starting visual checks\n✓ shadcn-button--default (6/12)\n✓ filter-search--with-query (7/12)\n",
      })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await canvas.findByTestId("panel-shell");
    const scope = within(shell);
    await expect(
      scope.getByRole("status", { name: /Visual test running/i }),
    ).toHaveAttribute("data-result-state", "running");
    await expect(
      scope.getByRole("progressbar", {
        name: "Visual Delta check progress",
      }),
    ).toHaveAttribute("aria-valuenow", "7");
    await expect(
      scope.getByRole("progressbar", {
        name: "Visual Delta check progress",
      }),
    ).toHaveAttribute("aria-valuemax", "12");
    const progressLog = scope.getByRole("button", {
      name: /Progress: ✓ filter-search--with-query \(7\/12\)/i,
    });
    await expect(progressLog).toBeInTheDocument();
  },
};

export const MissingBaseline: Story = {
  name: "Missing baseline",
  render: () => (
    <ThemeHost>
      <PanelShell {...({ backend: createMockVisualBackend(), seedEmpty: true, initialState: "missing" })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("status", { name: /Baseline missing/i }),
    ).toHaveAttribute("data-result-state", "missing");
  },
};

export const CaptureError: Story = {
  name: "Capture error",
  render: () => (
    <ThemeHost>
      <PanelShell {...({
        backend: createMockVisualBackend(),
        captureError: "Chromium could not capture the subject.",
      })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("status", { name: /Capture error/i }),
    ).toHaveAttribute("data-result-state", "error");
    await expect(
      canvas.getByText("Chromium could not capture the subject."),
    ).toBeInTheDocument();
  },
};

export const BaselineGeometryMismatch: Story = {
  name: "Baseline geometry mismatch",
  render: () => (
    <ThemeHost>
      <PanelShell {...({
        backend: createMockVisualBackend(),
        baselineGeometryMismatch: {
          baselineCss: { width: 1232, height: 187 },
          liveCss: { width: 264, height: 187 },
          captureViewport: { width: 1280, height: 900 },
        },
      })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const warning = await canvas.findByRole("alert", {
      name: /Baseline geometry mismatch/i,
    });
    await expect(warning).toHaveTextContent(
      "Baseline 1232×187 CSS px; live component 264×187 CSS px",
    );
    await expect(warning).toHaveTextContent("1280×900 capture viewport");
  },
};

export const ConfigurationWarnings: Story = {
  name: "Configuration warnings",
  render: () => (
    <ThemeHost>
      <PanelShell {...({ backend: createMockVisualBackend(), configurationOpen: true })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("heading", { name: "Configuration" }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Resolved" }));
    await expect(
      canvas.getByRole("heading", { name: "Baselines" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Snapshot directory is mounted at /visual-baselines."),
    ).toBeInTheDocument();
  },
};

export const ConfigurationDefaults: Story = {
  name: "Configuration defaults",
  render: () => (
    <ThemeHost>
      <PanelShell {...({ backend: createMockVisualBackend(), configurationOpen: true })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const threshold = await canvas.findByLabelText("Pass threshold percentage");
    await expect(
      canvas.getByRole("tab", { name: "Defaults", selected: true }),
    ).toBeInTheDocument();
    await expect(canvas.getAllByRole("slider")).toHaveLength(6);
    await userEvent.clear(threshold);
    await userEvent.type(threshold, "1.5");
    await userEvent.tab();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(/Project defaults saved/),
    ).toBeInTheDocument();
  },
};

export const ConfigurationSaveFailure: Story = {
  name: "Configuration save failure",
  render: () => (
    <ThemeHost>
      <PanelShell {...({
        backend: createMockVisualBackend(),
        configurationOpen: true,
        configurationSaveError: "Configuration file is read-only.",
      })} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const opacity = await canvas.findByLabelText("Overlay opacity");
    await userEvent.clear(opacity);
    await userEvent.type(opacity, "0.7");
    await userEvent.tab();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Configuration file is read-only.",
    );
    await expect(opacity).toHaveValue(0.7);
  },
};

export const NarrowConfigurationScrolling: Story = {
  name: "Narrow configuration scrolling",
  render: () => (
    <ThemeHost>
      <div style={{ width: 360, height: 280 }}>
        <PanelShell
          backend={createMockVisualBackend()}
          configurationOpen
        />
      </div>
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const defaults = await canvas.findByRole("tabpanel", { name: "Defaults" });
    const scrollSurface = defaults.parentElement;
    await expect(scrollSurface).not.toBeNull();
    await expect(scrollSurface!.scrollHeight).toBeGreaterThanOrEqual(
      scrollSurface!.clientHeight,
    );
    await expect(getComputedStyle(scrollSurface!).overflowY).toBe("auto");
  },
};

export const CurrentRunReview: Story = {
  name: "Current run review",
  render: () => (
    <ThemeHost>
      <PanelShell backend={createMockVisualBackend()} runAvailable />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await canvas.findByTestId("panel-shell");
    const scope = within(shell);
    const page = within(document.body);

    await userEvent.click(
      scope.getByRole("button", {
        name: /Choose Accept story, component, or current run scope/i,
      }),
    );
    await userEvent.click(
      await page.findByRole("button", { name: "Current run scope" }),
    );
    await userEvent.click(
      scope.getByRole("button", { name: "Accept current run" }),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-accept-scope")).toHaveTextContent(
        "run",
      ),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-review")).toHaveTextContent("approved"),
    );
  },
};

export const MixedModeFailure: Story = {
  name: "Mixed mode failure",
  render: () => (
    <ThemeHost>
      <PanelShell
        backend={createMockVisualBackend()}
        initialState="failed"
        modeNames={["Dark desktop", "High contrast"]}
        modeResults={{
          Default: "passed",
          "Dark desktop": "failed",
          "High contrast": "passed",
        }}
      />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await canvas.findByTestId("panel-shell");
    const scope = within(shell);
    const page = within(document.body);

    await expect(
      scope.getByRole("button", {
        name: "Visual mode: Default, passed",
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      scope.getByRole("button", {
        name: "Visual mode: Default, passed",
      }),
    );
    await userEvent.click(
      await page.findByRole("button", {
        name: "Dark desktop mode, failed",
      }),
    );
    await expect(scope.getByTestId("fixture-mode")).toHaveTextContent(
      "Dark desktop",
    );
    await expect(scope.getByText(/2 passed · 1 failed/)).toBeInTheDocument();
  },
};

export const ManagerIntegrationFixture: Story = {
  name: "Manager integration fixture",
  // Opt out of meta skip-visual so the real Visual Delta panel hydrates.
  tags: ["!skip-visual"],
  parameters: {
    visualDelta: {
      images: ["/visual-baselines/shadcn/button/default-chromium-darwin.png"],
      interactions: [
        {
          id: "opened-state",
          label: "Opened state",
          src: "/visual-baselines/shadcn/button/default--opened-state-chromium-darwin.png",
        },
      ],
      modes: {
        "Dark desktop": { globals: { colorMode: "dark" } },
        "Light mobile": {
          globals: {
            colorMode: "light",
            viewport: { value: "mobile1", isRotated: false },
          },
        },
      },
      ignoreSelectors: ['[data-testid="panel-shell"]'],
    },
  },
  render: () => (
    <ThemeHost>
      <PanelShell
        backend={createMockVisualBackend()}
        initialState="passed"
      />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId("panel-shell")).toBeInTheDocument();
  },
};

export const ManagerFullViewportIntegrationFixture: Story = {
  name: "Manager full viewport integration fixture",
  tags: ["!skip-visual"],
  parameters: {
    visualDelta: {
      images: [
        "/visual-baselines/shadcn/sidebar/sidebar-footer-chromium-darwin.png",
      ],
      cropToViewport: true,
    },
  },
  render: () => (
    <ThemeHost>
      <PanelShell
        backend={createMockVisualBackend()}
        initialState="passed"
      />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId("panel-shell")).toBeInTheDocument();
  },
};

export const Responsive1440ViewportCanary: Story = {
  name: "Responsive 1440 viewport canary",
  tags: ["!skip-visual"],
  parameters: {
    visualDelta: {
      images: [
        {
          src: "/visual-baselines/shadcn/tabs/preview-chromium-darwin.png",
          viewport: { width: 1440, height: 960 },
          deviceScaleFactor: 3,
          align: "viewport",
          placement: "right",
        },
      ],
      cropToViewport: true,
    },
  },
  render: () => <ResponsiveViewportCanary />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByTestId("responsive-viewport-canary"),
    ).toBeInTheDocument();
  },
};

export const DelayedStoryCompletion: Story = {
  name: "Delayed story completion",
  tags: ["!skip-visual"],
  parameters: {
    visualDelta: {
      images: ["/visual-baselines/shadcn/button/default-chromium-darwin.png"],
    },
  },
  render: () => (
    <ThemeHost>
      <PanelShell
        backend={createMockVisualBackend()}
        initialState="passed"
      />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    canvasElement.dataset.visualDeltaDelayedPlay = "pending";
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    canvasElement.dataset.visualDeltaDelayedPlay = "complete";
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId("panel-shell")).toBeInTheDocument();
  },
};

export const PlacementAndGallery: Story = {
  name: "Placement and gallery",
  render: () => (
    <ThemeHost>
      <PanelShell backend={createMockVisualBackend()} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() => canvas.getByTestId("panel-shell"));
    const scope = within(shell);

    await userEvent.click(
      scope.getByRole("switch", {
        name: "Hide overlay (Baseline right of live)",
      }),
    );
    await expect(scope.getByTestId("fixture-overlay-on")).toHaveTextContent(
      "false",
    );

    await userEvent.click(
      scope.getByRole("switch", { name: "Baseline left of live" }),
    );
    await expect(scope.getByTestId("fixture-overlay-on")).toHaveTextContent(
      "true",
    );
    await expect(scope.getByTestId("fixture-placement")).toHaveTextContent(
      "left",
    );

    await userEvent.click(
      scope.getByRole("switch", { name: "Image only (hide live story)" }),
    );
    await expect(scope.getByTestId("fixture-live-visible")).toHaveTextContent(
      "false",
    );

    await userEvent.click(scope.getByTitle("Select image 2"));
    await expect(scope.getByTestId("fixture-gallery-index")).toHaveTextContent(
      "1",
    );
  },
};

export const CreateBaseline: Story = {
  name: "Create baseline",
  render: () => (
    <ThemeHost>
      <PanelShell backend={createMockVisualBackend()} seedEmpty />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() => canvas.getByTestId("panel-shell"));
    const scope = within(shell);

    await userEvent.click(
      scope.getByRole("button", { name: /Create visual baseline/i }),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-actions")).toHaveTextContent(
        "create-baseline",
      ),
    );
    await expect(
      scope.getByLabelText(/Visual status: Pass/i),
    ).toBeInTheDocument();
  },
};

export const UpdateAndReview: Story = {
  name: "Update and review",
  render: () => (
    <ThemeHost>
      <PanelShell backend={createMockVisualBackend()} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() => canvas.getByTestId("panel-shell"));
    const scope = within(shell);
    const page = within(document.body);

    await userEvent.click(
      scope.getByRole("button", { name: /More Default baseline actions/i }),
    );
    await userEvent.click(
      await waitFor(() =>
        page.getByRole("button", { name: /Update Default baseline/i }),
      ),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-actions")).toHaveTextContent(
        "update-baseline",
      ),
    );

    await userEvent.click(
      scope.getByRole("switch", {
        name: /Mark visual baseline ready for review/i,
      }),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-review")).toHaveTextContent("ready"),
    );
  },
};

export const ToggleSkipVisual: Story = {
  name: "Toggle skip-visual",
  render: () => (
    <ThemeHost>
      <PanelShell backend={createMockVisualBackend()} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() => canvas.getByTestId("panel-shell"));
    const scope = within(shell);
    const page = within(document.body);

    await userEvent.click(
      scope.getByRole("button", { name: /More Visual Delta actions/i }),
    );
    await userEvent.click(
      await waitFor(() =>
        page.getByRole("button", { name: /Skip visual tests/i }),
      ),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-actions")).toHaveTextContent(
        "skip-visual",
      ),
    );
    await expect(scope.getByTestId("fixture-skip-visual")).toHaveTextContent(
      "true",
    );
    await waitFor(() =>
      expect(
        page.queryByRole("button", { name: /Skip visual tests/i }),
      ).not.toBeInTheDocument(),
    );

    const includeButton = await waitFor(() =>
      scope.getByRole("button", { name: /Include in visual tests/i }),
    );
    await expect(includeButton).toBeVisible();
    await userEvent.click(includeButton);
    await waitFor(() =>
      expect(scope.getByTestId("fixture-skip-visual")).toHaveTextContent(
        "false",
      ),
    );
  },
};

export const DiffAndRunVisual: Story = {
  name: "Diff and run visual",
  render: () => (
    <ThemeHost>
      <PanelShell backend={createMockVisualBackend()} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() => canvas.getByTestId("panel-shell"));
    const scope = within(shell);
    const page = within(document.body);

    await userEvent.click(
      scope.getByRole("button", {
        name: /Compare via html-to-image/i,
      }),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-diff")).toHaveTextContent("Live Diff"),
    );
    await expect(scope.getByTestId("fixture-actions")).toHaveTextContent(
      "diff",
    );

    await userEvent.click(
      scope.getByRole("button", {
        name: /Choose Story, Component, Affected, or All/i,
      }),
    );
    await userEvent.click(
      await waitFor(() => page.getByRole("button", { name: /^Use Story$/i })),
    );
    await userEvent.click(
      scope.getByRole("button", {
        name: /Run visual test for this story/i,
      }),
    );
    await userEvent.click(
      await waitFor(() => scope.getByRole("button", { name: /Stop/i })),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-actions")).toHaveTextContent(
        "cancel-tests",
      ),
    );

    await userEvent.click(
      scope.getByRole("button", {
        name: /Run visual test for this story/i,
      }),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-actions")).toHaveTextContent(
        "run-tests",
      ),
    );
  },
};

export const AccordionCreateInteraction: Story = {
  name: "Accordion create interaction",
  render: () => (
    <ThemeHost>
      <PanelShell backend={createMockVisualBackend()} />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() => canvas.getByTestId("panel-shell"));
    const scope = within(shell);

    await userEvent.click(
      scope.getByRole("button", { name: /^Opens chooser(?:\s|$)/i }),
    );
    await expect(scope.getByTestId("fixture-expanded-id")).toHaveTextContent(
      "opens-chooser",
    );

    await userEvent.click(
      scope.getByRole("button", { name: /Create baseline/i }),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-actions")).toHaveTextContent(
        "create-interaction",
      ),
    );
    await expect(scope.getByTestId("fixture-interaction")).toHaveTextContent(
      "opens-chooser",
    );

    await userEvent.click(
      scope.getByRole("button", {
        name: /Default End of play/i,
      }),
    );
    await waitFor(() =>
      expect(scope.getByTestId("fixture-expanded-id")).toHaveTextContent(
        "default",
      ),
    );
    await userEvent.click(
      scope.getByRole("switch", { name: /Difference distribution/i }),
    );
    await expect(
      scope.getByTestId("fixture-section-body-default"),
    ).toHaveTextContent("distribution on");
  },
};
