export type BaselineImageReadiness = {
  generation: number;
  activeGeneration: number;
  source: string;
  activeSource: string | undefined;
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
};

/** Only the current, fully decoded non-empty PNG may expose overlay chrome. */
export function baselineImageReady(
  readiness: BaselineImageReadiness,
): boolean {
  return (
    readiness.generation === readiness.activeGeneration &&
    readiness.source === readiness.activeSource &&
    readiness.complete &&
    Number.isFinite(readiness.naturalWidth) &&
    readiness.naturalWidth > 0 &&
    Number.isFinite(readiness.naturalHeight) &&
    readiness.naturalHeight > 0
  );
}
