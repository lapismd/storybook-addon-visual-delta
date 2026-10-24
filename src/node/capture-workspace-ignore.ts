export function validateCaptureWorkspaceIgnore(input: unknown): {
  value: string[];
  errors: string[];
} {
  if (input === undefined) return { value: [], errors: [] };
  if (!Array.isArray(input)) {
    return {
      value: [],
      errors: [
        "captureWorkspaceIgnore must be an array of relative directories.",
      ],
    };
  }
  const value: string[] = [];
  const errors: string[] = [];
  for (const candidate of input) {
    if (typeof candidate !== "string") {
      errors.push("captureWorkspaceIgnore entries must be strings.");
      continue;
    }
    const normalized = candidate
      .trim()
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/\/+$/, "");
    const segments = normalized.split("/");
    if (
      !normalized ||
      normalized === "." ||
      normalized.startsWith("/") ||
      /^[A-Za-z]:\//.test(normalized) ||
      segments.some(
        (segment) => !segment || segment === "." || segment === "..",
      )
    ) {
      errors.push(
        `captureWorkspaceIgnore entry ${JSON.stringify(candidate)} must be a root-relative directory without . or .. segments.`,
      );
      continue;
    }
    if (value.includes(normalized)) {
      errors.push(`captureWorkspaceIgnore contains duplicate ${normalized}.`);
      continue;
    }
    if (
      normalized === ".visual-delta" ||
      normalized === ".visual-delta/artifacts" ||
      normalized.startsWith(".visual-delta/artifacts/") ||
      normalized === ".visual-delta/cache" ||
      normalized.startsWith(".visual-delta/cache/")
    ) {
      errors.push(
        `captureWorkspaceIgnore cannot suppress package-owned directory ${normalized}.`,
      );
      continue;
    }
    value.push(normalized);
  }
  return { value, errors };
}
