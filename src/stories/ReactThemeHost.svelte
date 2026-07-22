<script lang="ts">
  import React, { type ReactElement } from "react";
  import { createRoot } from "react-dom/client";
  import { ThemeProvider, convert, themes } from "storybook/theming";

  type Props = {
    /** React tree to mount into the Storybook preview host. */
    element: ReactElement;
    /** Test id for the host wrapper. */
    testId?: string;
  };

  let { element, testId = "react-theme-host" }: Props = $props();

  const lightTheme = convert(themes.light);
</script>

<div
  class="react-theme-host"
  data-testid={testId}
  {@attach (el) => {
    const root = createRoot(el);

    $effect(() => {
      root.render(
        React.createElement(ThemeProvider, { theme: lightTheme }, element),
      );
    });

    return () => {
      root.unmount();
    };
  }}
></div>

<style>
  .react-theme-host {
    background: #fff;
    padding: 12px;
    min-height: 48px;
  }
</style>
