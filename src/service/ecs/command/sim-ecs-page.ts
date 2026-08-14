import { SimEcsInvalidParameterException } from "../error/sim-ecs.error.js";

/**
 * How many items one listing response carries when the request says nothing.
 *
 * ECS pages its listings at 100 by default, and takes a `maxResults` up to
 * that same 100.
 */
const defaultItemsPerPage = 100;

interface SimEcsPageRequest {
  readonly maxResults?: number | undefined;
  readonly nextToken?: string | undefined;
}

/**
 * One page of an ECS listing, and the token that reaches the next one.
 *
 * The token is the offset the next page starts at. A token that could not have
 * come from a listing of these items is refused rather than answered from
 * somewhere in the middle, since a real token names a position ECS itself
 * chose.
 */
export class SimEcsPage<Item> {
  public readonly items: readonly Item[];
  public readonly nextToken: string | undefined;

  constructor(listed: readonly Item[], request: SimEcsPageRequest) {
    const itemsPerPage = SimEcsPage.itemsPerPage(request.maxResults);
    const startIndex = SimEcsPage.startIndex(
      request.nextToken,
      listed.length,
      itemsPerPage,
    );
    const nextIndex = startIndex + itemsPerPage;

    this.items = listed.slice(startIndex, nextIndex);
    this.nextToken = SimEcsPage.tokenFor(nextIndex, listed.length);
  }

  private static itemsPerPage(maxResults: number | undefined): number {
    if (maxResults === undefined) {
      return defaultItemsPerPage;
    }

    if (
      !Number.isSafeInteger(maxResults) ||
      maxResults < 1 ||
      maxResults > defaultItemsPerPage
    ) {
      throw new SimEcsInvalidParameterException(
        `maxResults must be a whole number from 1 to ` +
          `${String(defaultItemsPerPage)}.`,
      );
    }

    return maxResults;
  }

  private static startIndex(
    nextToken: string | undefined,
    listedCount: number,
    itemsPerPage: number,
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
      throw new SimEcsInvalidParameterException(
        "nextToken is not a token this simulation issued.",
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
