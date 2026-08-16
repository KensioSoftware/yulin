import { SimLogsInvalidParameterException } from "../error/sim-logs.error.js";

interface SimLogsPageProperties<T> {
  /** Everything the request selected, before paging. */
  readonly listed: readonly T[];

  readonly limit?: number | undefined;
  readonly nextToken?: string | undefined;

  /** The largest page size this operation offers. */
  readonly maximumLimit: number;
}

/**
 * One page of a listing, and the token that reaches the next one.
 *
 * Every paged CloudWatch Logs operation here pages the same way, on an offset
 * into what the request selected. Tokens are the canonical representation of
 * that offset, so a token from somewhere else is refused rather than quietly
 * starting again from the beginning.
 */
export class SimLogsPage<T> {
  readonly items: readonly T[];
  readonly nextToken: string | undefined;

  constructor(properties: SimLogsPageProperties<T>) {
    const { listed, maximumLimit } = properties;
    const limit = pageLimit(properties.limit, maximumLimit);
    const startIndex = pageStartIndex(properties.nextToken, listed.length);
    const nextIndex = startIndex + limit;

    this.items = listed.slice(startIndex, nextIndex);
    this.nextToken = nextIndex >= listed.length ? undefined : String(nextIndex);
  }
}

function pageLimit(
  requested: number | undefined,
  maximumLimit: number,
): number {
  const limit = requested ?? maximumLimit;

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximumLimit) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value '${String(requested)}' at 'limit' ` +
        `failed to satisfy constraint: Member must be between 1 and ` +
        `${maximumLimit}`,
    );
  }

  return limit;
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
    throw new SimLogsInvalidParameterException(
      "The specified nextToken is not a token this simulation issued",
    );
  }

  return startIndex;
}
