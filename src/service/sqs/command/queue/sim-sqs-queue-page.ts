import { SimSqsInvalidParameterValue } from "../../error/sim-sqs.error.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";

const defaultMaxResults = 1000;
const maxMaxResults = 1000;

/**
 * The paging fields a ListQueues request carries.
 */
export interface SimSqsQueuePageInput {
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * One page of listed queues, and the token that reaches the next one.
 */
export class SimSqsQueuePage {
  public readonly queues: readonly SimSqsQueue[];
  public readonly nextToken: string | undefined;

  constructor(listed: readonly SimSqsQueue[], input: SimSqsQueuePageInput) {
    const maxResults = SimSqsQueuePage.maxResults(input.MaxResults);
    const startIndex = SimSqsQueuePage.startIndex(
      input.NextToken,
      listed.length,
    );
    const nextIndex = startIndex + maxResults;

    this.queues = listed.slice(startIndex, nextIndex);
    this.nextToken = SimSqsQueuePage.tokenFor(nextIndex, listed.length);
  }

  private static maxResults(requested: number | undefined): number {
    const maxResults = requested ?? defaultMaxResults;

    if (
      !Number.isSafeInteger(maxResults) ||
      maxResults < 1 ||
      maxResults > maxMaxResults
    ) {
      throw new SimSqsInvalidParameterValue(
        `Value ${String(requested)} for parameter MaxResults is invalid. ` +
          `Reason: Must be an integer from 1 to ${String(maxMaxResults)}.`,
      );
    }

    return maxResults;
  }

  /**
   * Read a continuation token as its offset into the listed queues.
   *
   * Tokens are the canonical non-negative integer representation this command
   * emits, so anything else is refused rather than silently starting again from
   * the beginning.
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
      throw new SimSqsInvalidParameterValue(
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
