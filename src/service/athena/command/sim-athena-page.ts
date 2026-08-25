import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";

/**
 * How many items a listing carries when the request asks for no maximum.
 */
const defaultItemsPerPage = 50;

/**
 * The most a listing carries where the request asks for no maximum.
 */
const defaultMaximumItemsPerPage = 50;

interface SimAthenaPageProperties<Item> {
  readonly listed: readonly Item[];
  readonly maxResults: number | undefined;
  readonly nextToken: string | undefined;

  /**
   * The smallest `MaxResults` this listing takes.
   *
   * Athena documents a different floor per listing. `ListWorkGroups` starts at
   * 1 and `ListNamedQueries` starts at 0, so the two cannot share one.
   */
  readonly minimumResults: number;

  /**
   * The largest `MaxResults` this listing takes, where it is not 50.
   *
   * `GetQueryResults` pages rows rather than resources and goes up to 1000.
   * The listings of workgroups and named queries stop at 50.
   */
  readonly maximumResults?: number | undefined;
}

/**
 * One page of a listing, and the token that reaches the next one.
 */
export class SimAthenaPage<Item> {
  public readonly items: readonly Item[];
  public readonly nextToken: string | undefined;

  constructor(properties: SimAthenaPageProperties<Item>) {
    const listed = properties.listed;
    const startIndex = SimAthenaPage.startIndex(
      properties.nextToken,
      listed.length,
    );
    const pageSize = SimAthenaPage.pageSize(properties);

    this.items = listed.slice(startIndex, startIndex + pageSize);
    this.nextToken = SimAthenaPage.tokenFor(
      startIndex + pageSize,
      listed.length,
      pageSize,
    );
  }

  /**
   * Read the page size a request asked for, refusing one outside the range
   * AWS takes.
   */
  private static pageSize<Item>(
    properties: SimAthenaPageProperties<Item>,
  ): number {
    const maxResults = properties.maxResults;

    if (maxResults === undefined) {
      return defaultItemsPerPage;
    }

    const minimum = properties.minimumResults;
    const maximum = properties.maximumResults ?? defaultMaximumItemsPerPage;

    if (
      !Number.isSafeInteger(maxResults) ||
      maxResults < minimum ||
      maxResults > maximum
    ) {
      throw new SimAthenaInvalidRequestException(
        `MaxResults ${String(maxResults)} is outside the range ` +
          `${String(minimum)} to ${String(maximum)}`,
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

  /**
   * The token that reaches the page after this one, where there is one.
   *
   * A page of no items issues none. `MaxResults` of zero is a request for
   * nothing, and a token back to the same offset would leave a caller paging
   * for ever.
   */
  private static tokenFor(
    nextIndex: number,
    listedCount: number,
    pageSize: number,
  ): string | undefined {
    if (pageSize === 0 || nextIndex >= listedCount) {
      return undefined;
    }

    return String(nextIndex);
  }
}
