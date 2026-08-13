import { SimEventBridgeValidationException } from "../error/sim-event-bridge.error.js";

/**
 * How many items a listing carries when the request asks for no limit.
 *
 * Real EventBridge lets a request cap a listing at 100, and this is the cap it
 * applies when the request names none.
 */
const defaultItemsPerPage = 100;

const maximumItemsPerPage = 100;

/**
 * One page of a listing, and the token that reaches the next one.
 */
export class SimEventBridgePage<Item> {
  public readonly items: readonly Item[];
  public readonly nextToken: string | undefined;

  constructor(
    listed: readonly Item[],
    limit: number | undefined,
    nextToken: string | undefined,
  ) {
    const startIndex = SimEventBridgePage.startIndex(nextToken, listed.length);
    const nextIndex = startIndex + SimEventBridgePage.pageSize(limit);

    this.items = listed.slice(startIndex, nextIndex);
    this.nextToken = SimEventBridgePage.tokenFor(nextIndex, listed.length);
  }

  /**
   * Read the page size a request asked for, refusing one outside the range
   * real EventBridge takes.
   */
  private static pageSize(limit: number | undefined): number {
    if (limit === undefined) {
      return defaultItemsPerPage;
    }

    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > maximumItemsPerPage
    ) {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Limit Reason: ${String(limit)} is outside the ` +
          `range 1 to ${String(maximumItemsPerPage)}`,
      );
    }

    return limit;
  }

  /**
   * Read a continuation token as its offset into the listed items.
   *
   * A token is refused unless it is one of these listings could have issued,
   * which is an offset landing inside the items still to come. Anything else
   * is refused rather than answered with a listing starting somewhere real
   * EventBridge would never start one.
   */
  private static startIndex(
    nextToken: string | undefined,
    listedCount: number,
  ): number {
    if (nextToken === undefined) {
      return 0;
    }

    const startIndex = Number(nextToken);

    if (
      !Number.isSafeInteger(startIndex) ||
      startIndex <= 0 ||
      startIndex >= listedCount ||
      String(startIndex) !== nextToken
    ) {
      throw new SimEventBridgeValidationException(
        "Invalid parameter: NextToken is not a token this simulation issued",
      );
    }

    return startIndex;
  }

  private static tokenFor(
    nextIndex: number,
    listedCount: number,
  ): string | undefined {
    if (nextIndex >= listedCount) {
      return undefined;
    }

    return String(nextIndex);
  }
}
