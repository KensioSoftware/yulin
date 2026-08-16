import { SimCloudWatchInvalidParameterValueException } from "../error/sim-cloudwatch.error.js";

interface SimCloudWatchPageProperties<T> {
  /** Everything the request selected, before paging. */
  readonly listed: readonly T[];

  readonly nextToken?: string | undefined;

  /** How many entries one page of this operation holds. */
  readonly pageSize: number;
}

/**
 * One page of a listing, and the token that reaches the next one.
 *
 * CloudWatch listings take no page size of their own, so a page is a fixed
 * number of entries and the token is the offset of the next one. A token from
 * somewhere else is refused rather than quietly starting again from the
 * beginning, and an offset only means anything against the selection it was
 * issued for: a token carried over to a request with different filters reaches
 * a different place.
 */
export class SimCloudWatchPage<T> {
  readonly items: readonly T[];
  readonly nextToken: string | undefined;

  constructor(properties: SimCloudWatchPageProperties<T>) {
    const { listed, pageSize } = properties;
    const startIndex = pageStartIndex(properties.nextToken, listed.length);
    const nextIndex = startIndex + pageSize;

    this.items = listed.slice(startIndex, nextIndex);
    this.nextToken = nextIndex >= listed.length ? undefined : String(nextIndex);
  }
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
    throw new SimCloudWatchInvalidParameterValueException(
      "The parameter NextToken is not a token this simulation issued.",
    );
  }

  return startIndex;
}
