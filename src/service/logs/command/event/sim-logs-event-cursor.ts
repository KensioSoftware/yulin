import { SimLogsInvalidParameterException } from "../../error/sim-logs.error.js";

const forwardPrefix = "f/";
const backwardPrefix = "b/";

interface SimLogsEventCursorProperties {
  readonly eventCount: number;
  readonly limit: number;
  readonly startFromHead: boolean;
  readonly nextToken?: string | undefined;
}

/**
 * Where one page of a GetLogEvents read starts and ends.
 *
 * GetLogEvents pages in both directions, which is why it answers with two
 * tokens rather than one: a caller following `nextForwardToken` walks towards
 * newer events and one following `nextBackwardToken` walks towards older ones.
 * Reaching either end gives the same token back rather than nothing, which is
 * how a caller polling a stream knows to keep the token and ask again.
 */
export class SimLogsEventCursor {
  readonly startIndex: number;
  readonly endIndex: number;

  constructor(properties: SimLogsEventCursorProperties) {
    const { eventCount, limit, nextToken } = properties;
    const bounds =
      nextToken === undefined
        ? firstPage(properties)
        : tokenPage(nextToken, limit, eventCount);

    this.startIndex = Math.max(0, Math.min(bounds.startIndex, eventCount));
    this.endIndex = Math.max(this.startIndex, Math.min(bounds.endIndex, eventCount));
  }

  /**
   * The token that reaches the events after this page.
   */
  get nextForwardToken(): string {
    return `${forwardPrefix}${this.endIndex}`;
  }

  /**
   * The token that reaches the events before this page.
   */
  get nextBackwardToken(): string {
    return `${backwardPrefix}${this.startIndex}`;
  }
}

interface SimLogsEventCursorBounds {
  readonly startIndex: number;
  readonly endIndex: number;
}

/**
 * Where a read with no token starts.
 *
 * Real CloudWatch Logs starts at the newest events unless asked to start from
 * the head, so an unpaged read of a busy stream answers with the end of it.
 */
function firstPage(
  properties: SimLogsEventCursorProperties,
): SimLogsEventCursorBounds {
  const { eventCount, limit, startFromHead } = properties;

  return startFromHead
    ? { startIndex: 0, endIndex: limit }
    : { startIndex: eventCount - limit, endIndex: eventCount };
}

function tokenPage(
  nextToken: string,
  limit: number,
  eventCount: number,
): SimLogsEventCursorBounds {
  const index = tokenIndex(nextToken, eventCount);

  return nextToken.startsWith(backwardPrefix)
    ? { startIndex: index - limit, endIndex: index }
    : { startIndex: index, endIndex: index + limit };
}

function tokenIndex(nextToken: string, eventCount: number): number {
  const prefix = nextToken.slice(0, 2);
  const offset = nextToken.slice(2);
  const index = Number(offset);

  if (
    (prefix !== forwardPrefix && prefix !== backwardPrefix) ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index > eventCount ||
    String(index) !== offset
  ) {
    throw new SimLogsInvalidParameterException(
      "The specified nextToken is not a token this simulation issued",
    );
  }

  return index;
}
