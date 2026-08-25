import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";

/**
 * How many items a listing carries when the request asks for no maximum.
 */
const defaultItemsPerPage = 50;

/**
 * The most Athena lets one listing carry.
 */
const maximumItemsPerPage = 50;

/**
 * One page of a listing, and the token that reaches the next one.
 */
export class SimAthenaPage<Item> {
  public readonly items: readonly Item[];
  public readonly nextToken: string | undefined;

  constructor(
    listed: readonly Item[],
    maxResults: number | undefined,
    nextToken: string | undefined,
  ) {
    const startIndex = SimAthenaPage.startIndex(nextToken, listed.length);
    const nextIndex = startIndex + SimAthenaPage.pageSize(maxResults);

    this.items = listed.slice(startIndex, nextIndex);
    this.nextToken = SimAthenaPage.tokenFor(nextIndex, listed.length);
  }

  /**
   * Read the page size a request asked for, refusing one outside the range
   * AWS takes.
   */
  private static pageSize(maxResults: number | undefined): number {
    if (maxResults === undefined) {
      return defaultItemsPerPage;
    }

    if (
      !Number.isSafeInteger(maxResults) ||
      maxResults < 1 ||
      maxResults > maximumItemsPerPage
    ) {
      throw new SimAthenaInvalidRequestException(
        `MaxResults ${String(maxResults)} is outside the range 1 to ${String(
          maximumItemsPerPage,
        )}`,
      );
    }

    return maxResults;
  }

  /**
   * Read a continuation token as its offset into the listed items.
   *
   * A token is refused unless it is one these listings could have issued,
   * which is an offset landing inside the items still to come.
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
      throw new SimAthenaInvalidRequestException(
        "NextToken is not a token this simulation issued",
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
