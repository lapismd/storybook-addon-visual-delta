import React from "react";

/**
 * Viewport-sensitive canary used by manager overlay acceptance fixtures.
 */
export function ResponsiveViewportCanary() {
  return (
    <div className="canary" data-testid="responsive-viewport-canary">
      <span className="compact">Compact layout</span>
      <span className="desktop">Desktop layout</span>
      <style>{`
        .canary {
          box-sizing: border-box;
          min-height: 220px;
          padding: 32px;
          border: 4px solid #f97316;
          border-radius: 12px;
          background: #fff7ed;
          color: #7c2d12;
          font: 700 28px/1.2 system-ui, sans-serif;
        }
        .desktop { display: none; }
        @media (min-width: 1024px) {
          .canary {
            display: grid;
            min-height: 360px;
            place-items: center;
            border-color: #2563eb;
            background: #eff6ff;
            color: #1e3a8a;
            font-size: 44px;
          }
          .compact { display: none; }
          .desktop { display: inline; }
        }
      `}</style>
    </div>
  );
}
