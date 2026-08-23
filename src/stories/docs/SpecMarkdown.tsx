import React, {
  useEffect,
  useId,
  useRef,
  type Components,
  type ReactElement,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { rewriteSpecHref } from "./spec-chapters.js";

type SpecMarkdownProps = {
  /** Raw Markdown from a `spec/src` chapter (`?raw` import). */
  source: string;
};

function MermaidBlock({ chart }: { chart: string }): ReactElement {
  const reactId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) {
      return;
    }

    void (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
      });
      const id = `vd-spec-mermaid-${reactId}`;
      try {
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled && hostRef.current) {
          hostRef.current.innerHTML = svg;
        }
      } catch (error) {
        if (!cancelled && hostRef.current) {
          hostRef.current.textContent =
            error instanceof Error ? error.message : String(error);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (host) {
        host.innerHTML = "";
      }
    };
  }, [chart, reactId]);

  return (
    <div
      ref={hostRef}
      className="vd-spec-mermaid"
      role="img"
      aria-label="Mermaid diagram"
    />
  );
}

function isMermaid(className: string | undefined): boolean {
  return Boolean(className?.split(/\s+/).includes("language-mermaid"));
}

const markdownComponents: Components = {
  a({ href, children, ...rest }) {
    const nextHref = rewriteSpecHref(href);
    const external =
      typeof nextHref === "string" &&
      (nextHref.startsWith("http://") || nextHref.startsWith("https://"));
    return (
      <a
        {...rest}
        href={nextHref}
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {children}
      </a>
    );
  },
  code({ className, children, ...rest }) {
    const text = String(children).replace(/\n$/, "");
    if (isMermaid(className)) {
      return <MermaidBlock chart={text} />;
    }
    const inline = !className && !text.includes("\n");
    if (inline) {
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    const child = React.Children.toArray(children)[0];
    if (
      React.isValidElement(child) &&
      child.type === MermaidBlock
    ) {
      return <>{child}</>;
    }
    if (
      React.isValidElement<{ className?: string; children?: ReactNode }>(
        child,
      ) &&
      isMermaid(child.props.className)
    ) {
      return <>{child}</>;
    }
    return <pre>{children}</pre>;
  },
};

/**
 * Renders a canonical Visual Delta spec chapter inside Storybook docs.
 * Relative chapter links resolve to Spec MDX pages; mermaid fences render.
 */
export function SpecMarkdown({ source }: SpecMarkdownProps): ReactElement {
  return (
    <div className="vd-spec-markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {source}
      </Markdown>
      <style>{`
        .vd-spec-markdown {
          max-width: 52rem;
          color: inherit;
          line-height: 1.55;
        }
        .vd-spec-markdown h1 { font-size: 1.75rem; margin: 0 0 1rem; }
        .vd-spec-markdown h2 { font-size: 1.35rem; margin: 2rem 0 0.75rem; }
        .vd-spec-markdown h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
        .vd-spec-markdown p, .vd-spec-markdown ul, .vd-spec-markdown ol {
          margin: 0.75rem 0;
        }
        .vd-spec-markdown table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
          margin: 1rem 0;
        }
        .vd-spec-markdown th,
        .vd-spec-markdown td {
          border: 1px solid rgba(0, 0, 0, 0.12);
          padding: 0.4rem 0.55rem;
          text-align: left;
          vertical-align: top;
        }
        .vd-spec-markdown th { background: rgba(0, 0, 0, 0.04); }
        .vd-spec-markdown pre {
          overflow: auto;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.04);
        }
        .vd-spec-markdown code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.9em;
        }
        .vd-spec-markdown :not(pre) > code {
          padding: 0.1em 0.35em;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.06);
        }
        .vd-spec-mermaid {
          margin: 1.25rem 0;
          overflow: auto;
        }
        .vd-spec-mermaid svg { max-width: 100%; height: auto; }
      `}</style>
    </div>
  );
}

export function SpecMirrorBanner(): ReactElement {
  return (
    <aside
      className="vd-spec-mirror-banner"
      style={{
        margin: "0 0 1.25rem",
        padding: "0.75rem 1rem",
        borderRadius: 6,
        border: "1px solid rgba(0, 0, 0, 0.12)",
        background: "rgba(0, 0, 0, 0.03)",
        maxWidth: "52rem",
        lineHeight: 1.5,
      }}
    >
      <strong>Browseable mirror.</strong> Storybook renders the canonical
      Markdown under <code>spec/src/</code>. Edit that tree for normative
      changes. mdBook remains the lint and build gate (
      <code>deno task spec:check</code> /{" "}
      <code>deno task spec:serve</code>).
    </aside>
  );
}
