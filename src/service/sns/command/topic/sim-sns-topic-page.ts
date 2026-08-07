import { SimSnsInvalidParameterException } from "../../error/sim-sns.error.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";

/**
 * How many topics one ListTopics response carries.
 *
 * Real SNS gives the request no say in this: it pages at 100 and hands back a
 * token for the rest.
 */
const topicsPerPage = 100;

/**
 * One page of listed topics, and the token that reaches the next one.
 */
export class SimSnsTopicPage {
  public readonly topics: readonly SimSnsTopic[];
  public readonly nextToken: string | undefined;

  constructor(listed: readonly SimSnsTopic[], nextToken: string | undefined) {
    const startIndex = SimSnsTopicPage.startIndex(nextToken, listed.length);
    const nextIndex = startIndex + topicsPerPage;

    this.topics = listed.slice(startIndex, nextIndex);
    this.nextToken = SimSnsTopicPage.tokenFor(nextIndex, listed.length);
  }

  /**
   * Read a continuation token as its offset into the listed topics.
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
