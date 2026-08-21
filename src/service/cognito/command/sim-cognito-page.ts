import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

/**
 * The most Cognito will return in one page of most listings.
 */
const maxMaxResults = 60;

interface SimCognitoPageProperties {
  readonly maxResults: number;
  readonly nextToken: string | undefined;
  /**
   * What this operation calls its page size input. `ListUsers` calls it
   * `Limit`, so a refusal has to name the input the caller actually wrote.
   */
  readonly maxResultsField?: string;
  /**
   * What this operation calls its continuation token. `ListUsers` calls it
   * `PaginationToken`.
   */
  readonly nextTokenField?: string;

  /**
   * The largest page this operation will hand back, where it is not the sixty
   * most of them allow. `ListWebAuthnCredentials` stops at twenty.
   */
  readonly mostResults?: number;

  /**
   * The smallest page size this operation takes, where it is not one.
   * `ListWebAuthnCredentials` documents a minimum of zero.
   */
  readonly leastResults?: number;
}

/**
 * One page of listed items, and the token that reaches the next one.
 *
 * Every Cognito listing pages the same way, so the rules live here once. How
 * many items a page holds by default is not shared, because `ListUserPools`
 * insists on being told and the others do not.
 */
export class SimCognitoPage<TItem> {
  public readonly items: readonly TItem[];
  public readonly nextToken: string | undefined;

  constructor(listed: readonly TItem[], properties: SimCognitoPageProperties) {
    const maxResults = SimCognitoPage.maxResults(
      properties.maxResults,
      properties.maxResultsField ?? "MaxResults",
      properties.leastResults ?? 1,
      properties.mostResults ?? maxMaxResults,
    );
    const startIndex = SimCognitoPage.startIndex(
      properties.nextToken,
      listed.length,
      properties.nextTokenField ?? "NextToken",
    );
    const nextIndex = startIndex + maxResults;

    this.items = listed.slice(startIndex, nextIndex);
    this.nextToken = SimCognitoPage.tokenFor(nextIndex, listed.length);
  }

  private static maxResults(
    requested: number,
    field: string,
    least: number,
    most: number,
  ): number {
    if (
      !Number.isSafeInteger(requested) ||
      requested < least ||
      requested > most
    ) {
      throw new SimCognitoInvalidParameterException(
        `${field} must be a whole number between ${String(least)} and ${String(
          most,
        )}`,
      );
    }

    // A page size of zero is the whole page. Real Cognito documents zero as a
    // valid MaxResults for ListWebAuthnCredentials and says nothing about what
    // it answers with, so this reads it the way a refresh token validity of
    // zero is read, as the default rather than as none at all.
    return requested === 0 ? most : requested;
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
    field: string,
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
        `${field} is not a token this simulation issued`,
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
