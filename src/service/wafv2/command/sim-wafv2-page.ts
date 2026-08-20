import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";

/**
 * The largest page a WAFv2 listing will hand back.
 */
const maximumLimit = 500;

interface SimWafPageProperties<T> {
  /** Everything the request selected, before paging. */
  readonly listed: readonly T[];

  readonly limit?: number | undefined;
  readonly nextMarker?: string | undefined;
}

/**
 * One page of a WAFv2 listing, and the marker that reaches the next one.
 *
 * The marker is an offset into what the request selected. That is only
 * meaningful against the same selection, so a marker issued elsewhere is
 * refused rather than quietly starting again from the beginning.
 */
export class SimWafPage<T> {
  readonly items: readonly T[];
  readonly nextMarker: string | undefined;

  constructor(properties: SimWafPageProperties<T>) {
    const { listed } = properties;
    const limit = requiredLimit(properties.limit);
    const startIndex = pageStartIndex(properties.nextMarker, listed.length);
    const nextIndex = startIndex + limit;

    this.items = listed.slice(startIndex, nextIndex);
    this.nextMarker =
      nextIndex >= listed.length ? undefined : String(nextIndex);
  }
}

function requiredLimit(requested: number | undefined): number {
  const limit = requested ?? maximumLimit;

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximumLimit) {
    throw new SimWafInvalidParameterException(
      `Error reason: The limit ${String(requested)} is not between 1 and ` +
        `${maximumLimit}, field: LIMIT, parameter: ${String(requested)}`,
    );
  }

  return limit;
}

function pageStartIndex(
  nextMarker: string | undefined,
  listedCount: number,
): number {
  if (nextMarker === undefined) {
    return 0;
  }

  const startIndex = Number(nextMarker);

  if (
    !Number.isSafeInteger(startIndex) ||
    startIndex < 0 ||
    startIndex >= listedCount ||
    String(startIndex) !== nextMarker
  ) {
    throw new SimWafInvalidParameterException(
      "Error reason: The NextMarker is not a marker this simulation issued, " +
        `field: NEXT_MARKER, parameter: ${nextMarker}`,
    );
  }

  return startIndex;
}
