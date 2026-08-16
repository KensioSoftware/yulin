import { SimLogsInvalidParameterException } from "../error/sim-logs.error.js";
import { requiredSimLogsLimit } from "./sim-logs-limit.js";

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
 *
 * An offset is only meaningful against the selection it was issued for, so a
 * token carried over to a request with a different prefix, filter or time
 * window reaches a different place. That is the same bargain simulated SQS
 * makes with its own listings, and it is documented rather than defended
 * against: there is no security boundary between a test and the simulator it
 * is calling.
 */
export class SimLogsPage<T> {
  readonly items: readonly T[];
  readonly nextToken: string | undefined;

  constructor(properties: SimLogsPageProperties<T>) {
    const { listed } = properties;
    const limit = requiredSimLogsLimit(
      properties.limit,
      properties.maximumLimit,
    );
    const startIndex = pageStartIndex(properties.nextToken, listed.length);
    const nextIndex = startIndex + limit;

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
    throw new SimLogsInvalidParameterException(
      "The specified nextToken is not a token this simulation issued",
    );
  }

  return startIndex;
}
