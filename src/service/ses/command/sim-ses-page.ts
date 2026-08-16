import { SimSesBadRequestException } from "../error/sim-ses.error.js";

/**
 * The largest page `ListEmailIdentities` will hand back.
 */
const maximumPageSize = 1000;

interface SimSesPageProperties<T> {
  /** Everything the request selected, before paging. */
  readonly listed: readonly T[];

  readonly pageSize?: number | undefined;
  readonly nextToken?: string | undefined;
}

/**
 * One page of an SES listing, and the token that reaches the next one.
 *
 * The token is an offset into what the request selected. That is only
 * meaningful against the same selection, so a token issued elsewhere is
 * refused rather than quietly starting again from the beginning.
 */
export class SimSesPage<T> {
  readonly items: readonly T[];
  readonly nextToken: string | undefined;

  constructor(properties: SimSesPageProperties<T>) {
    const { listed } = properties;
    const pageSize = requiredPageSize(properties.pageSize);
    const startIndex = pageStartIndex(properties.nextToken, listed.length);
    const nextIndex = startIndex + pageSize;

    this.items = listed.slice(startIndex, nextIndex);
    this.nextToken = nextIndex >= listed.length ? undefined : String(nextIndex);
  }
}

function requiredPageSize(requested: number | undefined): number {
  const pageSize = requested ?? maximumPageSize;

  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > maximumPageSize
  ) {
    throw new SimSesBadRequestException(
      `1 validation error detected: Value '${String(requested)}' at ` +
        `'pageSize' failed to satisfy constraint: Member must be between 1 ` +
        `and ${maximumPageSize}`,
    );
  }

  return pageSize;
}

function pageStartIndex(
  nextToken: string | undefined,
  listedCount: number,
): number {
  if (nextToken === undefined) {
    return 0;
  }

  const startIndex = Number(nextToken);

  if (
    !Number.isSafeInteger(startIndex) ||
    startIndex < 0 ||
    startIndex >= listedCount ||
    String(startIndex) !== nextToken
  ) {
    throw new SimSesBadRequestException(
      "The specified NextToken is not a token this simulation issued",
    );
  }

  return startIndex;
}
