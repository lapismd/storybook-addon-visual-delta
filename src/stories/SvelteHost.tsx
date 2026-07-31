import React, { useEffect, useRef } from "react";
import { mount, unmount, type Component } from "svelte";

const EMPTY_PROPS: Record<string, unknown> = {};

type SvelteHostProps = {
  /** Svelte 5 component constructor. */
  component: Component<any, any, any>;
  /** Props forwarded to the Svelte component. */
  props?: Record<string, unknown>;
  /** Optional test id on the mount host. */
  testId?: string;
};

/**
 * Mount a Svelte demo inside a React Storybook story (Compare Alignment, etc.).
 */
export function SvelteHost({
  component,
  props = EMPTY_PROPS,
  testId,
}: SvelteHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsKey = JSON.stringify(props);

  useEffect(() => {
    const target = hostRef.current;
    if (!target) return;
    target.replaceChildren();
    const instance = mount(component, {
      target,
      props: JSON.parse(propsKey) as Record<string, unknown>,
    });
    return () => {
      unmount(instance);
      target.replaceChildren();
    };
  }, [component, propsKey]);

  return (
    <div
      ref={hostRef}
      data-testid={testId}
      className="visual-delta-svelte-host"
    />
  );
}
