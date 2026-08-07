import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";

/**
 * How many items one listing response carries.
 *
 * Real SNS gives the request no say in this for any of its listings: topics,
 * subscriptions and a topic's subscriptions all page at 100 and hand back a
 * token for the rest.
 */
const itemsPerPage = 100;

/**
 * One page of a listing, and the token that reaches the next one.
 */
export class SimSnsPage<Item> {
  public readonly items: readonly Item[];
  public readonly nextToken: string | undefined;

  constructor(listed: readonly Item[], nextToken: string | undefined) {
    const startIndex = SimSnsPage.startIndex(nextToken, listed.length);
    const nextIndex = startIndex + itemsPerPage;

    this.items = listed.slice(startIndex, nextIndex);
    this.nextToken = SimSnsPage.tokenFor(nextIndex, listed.length);
  }

  /**
   * Read a continuation token as its offset into the listed items.
   *
   * A token is refused unless it is one of these listings could have issued,
   * which is the start of a page after the first. An offset landing part way
   * into a page is not one, so it is refused rather than answered with a
   * listing starting somewhere real SNS would never start one.
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
      startIndex % itemsPerPage !== 0 ||
      startIndex >= listedCount ||
      String(startIndex) !== nextToken
    ) {
      throw new SimSnsInvalidParameterException(
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
