import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoFormField, DemoMissing, ExampleStage } from "./demo-subjects.js";
import {
  EXAMPLE_SIZES,
  exampleBaseline,
  exampleVisualDelta,
} from "./example-sizes.js";

const meta = {
  title: "Examples/Form Field",
  tags: ["visual-delta-examples"],
  parameters: {
    docs: {
      description: {
        component: `
Form-flavored Examples.

- **Default** — wired baseline with matching stage geometry and Story canvas alignment.
- **Missing baseline** — **intentional** empty state (no \`visualDelta.images\`). Use it to read empty-state copy in the panel; it is not a broken story.
`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Default: Story = {
  name: "Default",
  parameters: {
    docs: {
      description: {
        story:
          "Due-date field subject with a matching baseline box. Open Visual Delta for overlay / Diff HTML — no geometry or alignment warnings.",
      },
    },
    visualDelta: exampleVisualDelta({
      images: [
        exampleBaseline("/visual-baselines/examples/form-field/default.png"),
      ],
    }),
  },
  render: () => (
    <ExampleStage {...EXAMPLE_SIZES.formField}>
      <DemoFormField />
    </ExampleStage>
  ),
};

export const MissingBaseline: Story = {
  name: "Missing baseline",
  parameters: {
    docs: {
      description: {
        story: `
**Intentional demo — not a bug.**

This story deliberately omits \`parameters.visualDelta.images\`. Open the Visual Delta panel to see the empty-state / missing-baseline messaging (including in static read-only builds).

Do not wire a baseline here; that would defeat the demo.
`,
      },
    },
  },
  render: () => (
    <ExampleStage
      {...EXAMPLE_SIZES.missing}
      intentionalLabel="INTENTIONAL empty state — no baseline wired (panel empty-state demo)"
    >
      <DemoMissing />
    </ExampleStage>
  ),
};
