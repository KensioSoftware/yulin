import { SimSsmValidationException } from "../../error/sim-ssm.error.js";

/**
 * The paging fields a parameter listing request carries.
 */
export interface SimSsmParameterPageInput {
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

interface SimSsmParameterPageLimits {
  readonly operation: string;
  readonly maxResults: number;
}

/**
 * One page of listed parameters, and the token that reaches the next one.
 *
 * The page sizes are small and worth keeping: GetParametersByPath returns ten
 * parameters at a time on real AWS, so code that reads a hierarchy without
 * following NextToken silently stops at the tenth parameter.
 */
export class SimSsmParameterPage<TItem> {
  public readonly items: readonly TItem[];
  public readonly nextToken: string | undefined;

  constructor(
    listed: readonly TItem[],
    input: SimSsmParameterPageInput,
    limits: SimSsmParameterPageLimits,
  ) {
    const maxResults = SimSsmParameterPage.maxResults(input.MaxResults, limits);
    const startIndex = SimSsmParameterPage.startIndex(
      input.NextToken,
      listed.length,
    );
    const nextIndex = startIndex + maxResults;

    this.items = listed.slice(startIndex, nextIndex);
    this.nextToken = nextIndex >= listed.length ? undefined : String(nextIndex);
  }

  private static maxResults(
    requested: number | undefined,
    limits: SimSsmParameterPageLimits,
  ): number {
    const maxResults = requested ?? limits.maxResults;

    if (
      !Number.isSafeInteger(maxResults) ||
      maxResults < 1 ||
      maxResults > limits.maxResults
    ) {
      throw new SimSsmValidationException(
        `${limits.operation} MaxResults must be a whole number between 1 ` +
          `and ${String(limits.maxResults)}`,
      );
    }

    return maxResults;
  }

  /**
   * Read a continuation token as its offset into the listed parameters.
   *
   * Tokens are the canonical non-negative integer representation these
   * commands emit, so anything else is refused rather than silently starting
   * again from the beginning.
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
      throw new SimSsmValidationException(
        "NextToken is not a token this simulation issued",
      );
    }

    return startIndex;
  }
}
