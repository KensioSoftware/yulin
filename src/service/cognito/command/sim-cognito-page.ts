import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

/**
 * The most Cognito will return in one page of either listing.
 */
const maxMaxResults = 60;

interface SimCognitoPageProperties {
  readonly maxResults: number;
  readonly nextToken: string | undefined;
}

/**
 * One page of listed items, and the token that reaches the next one.
 *
 * Both Cognito listings page the same way, so the rules live here once. How
 * many items a page holds by default is not shared, because `ListUserPools`
 * insists on being told and `ListUserPoolClients` does not.
 */
export class SimCognitoPage<TItem> {
  public readonly items: readonly TItem[];
  public readonly nextToken: string | undefined;

  constructor(listed: readonly TItem[], properties: SimCognitoPageProperties) {
    const maxResults = SimCognitoPage.maxResults(properties.maxResults);
    const startIndex = SimCognitoPage.startIndex(
      properties.nextToken,
      listed.length,
    );
    const nextIndex = startIndex + maxResults;

    this.items = listed.slice(startIndex, nextIndex);
    this.nextToken = SimCognitoPage.tokenFor(nextIndex, listed.length);
  }

  private static maxResults(requested: number): number {
    if (
      !Number.isSafeInteger(requested) ||
      requested < 1 ||
      requested > maxMaxResults
    ) {
      throw new SimCognitoInvalidParameterException(
        `MaxResults must be a whole number between 1 and ${String(maxMaxResults)}`,
      );
    }

    return requested;
  }

  /**
   * Read a continuation token as its offset into the listed items.
   *
   * Tokens are the canonical non-negative integer representation this
   * simulation emits, so anything else is rejected rather than silently
   * starting again from the beginning. An offset past the end of the list is
   * rejected for the same reason: no such token is ever issued.
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
      startIndex < 0 ||
      startIndex >= listedCount ||
      String(startIndex) !== nextToken
    ) {
      throw new SimCognitoInvalidParameterException(
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
