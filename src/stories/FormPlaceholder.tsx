import React from "react";
import "../../../../src/shared/forms/form-placeholder/FormPlaceholder.css";

/**
 * React stand-in for `@stevejuma/ui` `FormPlaceholder` — same dotted stub
 * chrome (`cv-form-placeholder`) for dummy story bodies inside React panel
 * fixtures. Prefer the Svelte component when the host is Svelte.
 */
export function FormPlaceholder({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["cv-form-placeholder", className].filter(Boolean).join(" ")}
      data-ui-part="form-placeholder"
      {...rest}
    >
      {children}
    </div>
  );
}
