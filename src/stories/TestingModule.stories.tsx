import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { TestingModuleShell } from "./TestingModuleShell.js";
import { ThemeHost } from "./ThemeHost.js";

const meta = {
  title: "Visual Delta/Testing Module",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component: [
          "Shared Testing Module chrome for the global runner and sidebar context menu:",
          "Run visual tests heading, play split (Create missing / Rewrite existing), and action checkboxes.",
          "See **Testing Module/Guidance** for scopes and Spec links (`VD-RUN-*`, `VD-MUT-*`).",
        ].join(" "),
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const GlobalDefaults: Story = {
  name: "Global defaults",
  render: () => (
    <ThemeHost>
      <TestingModuleShell variant="global" />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() =>
      canvas.getByTestId("testing-module-shell"),
    );
    const scope = within(shell);

    await expect(scope.getByText("Not run")).toBeInTheDocument();
    await expect(
      scope.getByRole("checkbox", { name: /run visual tests/i }),
    ).toBeChecked();
    await expect(
      scope.getByRole("checkbox", { name: /create missing baselines/i }),
    ).not.toBeChecked();
    await expect(
      scope.getByRole("checkbox", { name: /update status/i }),
    ).not.toBeChecked();
    await expect(
      scope.getByRole("checkbox", { name: /affected only/i }),
    ).toBeChecked();
    await expect(scope.getByTestId("affected-run-summary")).toHaveTextContent(
      "Up to date",
    );
    await expect(scope.getByTestId("fixture-baseline-mode")).toHaveTextContent(
      "create",
    );

    await userEvent.click(
      scope.getByRole("button", { name: /run selected visual actions/i }),
    );
    await expect(scope.getByTestId("fixture-last-action")).toHaveTextContent(
      "compare",
    );
    await userEvent.click(
      scope.getByRole("checkbox", { name: /affected only/i }),
    );
    await expect(scope.getByTestId("fixture-affected-only")).toHaveTextContent(
      "all",
    );
  },
};

export const SidebarContextMenu: Story = {
  name: "Sidebar context menu",
  render: () => (
    <ThemeHost>
      <TestingModuleShell variant="context" />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() =>
      canvas.getByTestId("testing-module-shell"),
    );
    const scope = within(shell);

    await expect(
      scope.getByTestId("visual-test-module-context"),
    ).toBeInTheDocument();

    await userEvent.click(
      scope.getByRole("checkbox", { name: /create missing baselines/i }),
    );
    await userEvent.click(
      scope.getByRole("checkbox", { name: /update status/i }),
    );
    await expect(scope.getByTestId("fixture-selected")).toHaveTextContent(
      "compare+create-missing+update-status",
    );

    await userEvent.click(
      scope.getByRole("button", { name: /run selected visual actions/i }),
    );
    await expect(scope.getByTestId("fixture-last-action")).toHaveTextContent(
      "compare+create-missing+update-status",
    );
  },
};

export const UpdateBaselinesMode: Story = {
  name: "Update baselines mode",
  render: () => (
    <ThemeHost>
      <TestingModuleShell variant="global" seedRewriteMode />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() =>
      canvas.getByTestId("testing-module-shell"),
    );
    const scope = within(shell);

    await expect(
      scope.getByRole("checkbox", { name: /update baselines/i }),
    ).not.toBeChecked();
    await expect(scope.getByTestId("fixture-baseline-mode")).toHaveTextContent(
      "rewrite",
    );
  },
};

export const RunningProgress: Story = {
  name: "Running progress",
  render: () => (
    <ThemeHost>
      <TestingModuleShell variant="context" seedRunningProgress />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() =>
      canvas.getByTestId("testing-module-shell"),
    );
    const scope = within(shell);

    await expect(
      scope.getByText("✓ shadcn-disclosure-accordion--opens-a-section (1/2)"),
    ).toBeInTheDocument();
    await expect(scope.getByTestId("compare-row-progress")).toHaveTextContent(
      "1/2",
    );
    await expect(scope.getByTestId("baseline-row-progress")).toHaveTextContent(
      "1/1",
    );
    await expect(scope.getByTestId("status-row-progress")).toHaveTextContent(
      "0/2",
    );
  },
};

export const GlobalPreflight: Story = {
  name: "Global preflight",
  render: () => (
    <ThemeHost>
      <TestingModuleShell variant="global" seedPreflightProgress />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = await waitFor(() =>
      canvas.getByTestId("testing-module-shell"),
    );
    const scope = within(shell);

    await expect(
      scope.getByText("Rebuilding Storybook static… 12s"),
    ).toBeInTheDocument();
    await expect(
      scope.queryByTestId("compare-row-progress"),
    ).not.toBeInTheDocument();
    await expect(
      scope.getByRole("button", { name: "Run tests to see results" }),
    ).toBeInTheDocument();
    await expect(
      scope.getByRole("button", { name: "Stop visual run" }),
    ).toBeInTheDocument();
  },
};

export const SidebarFilters: Story = {
  name: "Sidebar filters",
  render: () => (
    <ThemeHost>
      <TestingModuleShell variant="global" seedFilters />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const shell = await waitFor(() =>
      canvas.getByTestId("testing-module-shell"),
    );
    const scope = within(shell);

    await userEvent.click(
      scope.getByRole("button", { name: "Filter visual stories" }),
    );
    const dialog = page.getByRole("dialog", { name: "Visual story filters" });
    await expect(dialog).toBeInTheDocument();
    await expect(
      dialog.closest("[data-radix-scroll-area-viewport]"),
    ).not.toBeNull();
    await userEvent.click(
      page.getByRole("button", { name: "Needs attention" }),
    );
    await expect(scope.getByTestId("fixture-visual-filters")).toHaveTextContent(
      "quick.needs-attention",
    );
    await expect(
      scope.getByRole("button", {
        name: "Filter visual stories, 1 active",
      }),
    ).toBeInTheDocument();
    await expect(scope.getByTestId("visual-filter-count")).toHaveTextContent(
      "1",
    );
  },
};
