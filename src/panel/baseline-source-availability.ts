export type BaselineSourceAvailability = "present" | "absent" | "unknown";

type BaselineFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status">>;

export function baselineSourceStem(source: string): string {
  return source.split("?")[0] ?? source;
}

/**
 * Verify configured baseline references without treating a transient server
 * failure as proof that a committed PNG is absent.
 */
export async function verifyBaselineSources(
  sources: string[],
  options: {
    signal?: AbortSignal;
    fetcher?: BaselineFetch;
  } = {},
): Promise<Map<string, BaselineSourceAvailability>> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const uniqueSources = [...new Set(sources)];
  const results = await Promise.all(
    uniqueSources.map(async (source) => {
      try {
        const response = await fetcher(source, {
          method: "HEAD",
          cache: "no-store",
          signal: options.signal,
        });
        const availability: BaselineSourceAvailability = response.ok
          ? "present"
          : response.status === 404 || response.status === 410
            ? "absent"
            : "unknown";
        return [baselineSourceStem(source), availability] as const;
      } catch {
        return [baselineSourceStem(source), "unknown"] as const;
      }
    }),
  );
  return new Map(results);
}
