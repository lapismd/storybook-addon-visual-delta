import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoCard, ExampleStage } from "./demo-subjects.js";
import { EXAMPLE_SIZES, exampleBaseline } from "./example-sizes.js";

const meta = {
  title: "Examples/Card",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component: `
Card demos for the Visual Delta panel.

- **Match** — live subject and baseline share the same CSS box (no geometry warning).
- **Intentional difference** — same box size, deliberate pixel drift so overlay / Diff HTML show a delta. The red banner marks this as a teaching story, not a product bug.
`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Match: Story = {
  name: "Match",
  parameters: {
    docs: {
      description: {
        story:
          "Happy path: wired baseline matches the live card’s CSS size. Open Visual Delta — you should **not** see a baseline geometry warning. Placeholder PNG art is approximate; small pixel noise is fine.",
      },
    },
    visualDelta: {
      images: [
        exampleBaseline("/visual-baselines/examples/card/match.png"),
      ],
    },
  },
  render: () => (
    <ExampleStage {...EXAMPLE_SIZES.card}>
      <DemoCard />
    </ExampleStage>
  ),
};

export const IntentionalDifference: Story = {
  name: "Intentional difference",
  parameters: {
    docs: {
      description: {
        story: `
**Intentional demo — not a bug.**

- Live UI uses a drifted card (accent / bar widths) under a red “INTENTIONAL” banner.
- Baseline PNG includes the same banner and stage size, with the **non-drifted** card.
- Expect overlay / Diff HTML pixel deltas. Geometry should still agree (same CSS box).

Do not treat the red banner or heatmap as a regression in the Examples suite.
`,
      },
    },
    visualDelta: {
      images: [
        exampleBaseline("/visual-baselines/examples/card/drift.png"),
      ],
    },
  },
  render: () => (
    <ExampleStage
      {...EXAMPLE_SIZES.card}
      intentionalLabel="INTENTIONAL difference — expect Diff HTML / heatmap (geometry should match)"
    >
      <DemoCard drift />
    </ExampleStage>
  ),
};
