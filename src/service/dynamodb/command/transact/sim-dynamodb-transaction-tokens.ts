import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  SimDynamoDbIdempotentParameterMismatchException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import type { SimDynamoDbTransactWriteItem } from "./transact.command.js";

/**
 * Real DynamoDB remembers a ClientRequestToken for ten minutes.
 */
const idempotencyWindowMilliseconds = 10 * 60 * 1000;

/**
 * The longest ClientRequestToken real DynamoDB takes.
 */
const greatestTokenLength = 36;

/**
 * A transaction that has already been applied under a token.
 */
interface SimDynamoDbTransactionRecord {
  readonly payload: string;
  readonly at: Date;
}

interface SimDynamoDbTransactionTokensProperties {
  readonly clock: SimClock;
}

/**
 * The ClientRequestTokens one simulated DynamoDB has seen.
 *
 * A token makes a retry idempotent: replaying it with the same actions inside
 * the ten minute window succeeds without applying them again, and replaying it
 * with different actions is refused. The window is measured on the simulated
 * clock, so a test moves past it with `simAws.clock().advanceBy(...)` rather
 * than by waiting.
 *
 * Only a transaction that was applied is recorded. One that was cancelled or
 * refused never happened, so retrying it under the same token runs it again.
 */
export class SimDynamoDbTransactionTokens {
  private readonly clock: SimClock;
  private readonly records = new Map<string, SimDynamoDbTransactionRecord>();

  constructor(properties: SimDynamoDbTransactionTokensProperties) {
    this.clock = properties.clock;
  }

  /**
   * Whether this request has already been applied under this token.
   *
   * A token replayed with a different request is refused rather than answered
   * either way: applying it would write something the first call did not, and
   * reporting the first call's success would hide that it never ran.
   */
  isReplayOf(requestToken: string | undefined, payload: string): boolean {
    if (requestToken === undefined) {
      return false;
    }

    const record = this.recordUnder(requestToken);

    if (record === undefined) {
      return false;
    }

    if (record.payload !== payload) {
      throw new SimDynamoDbIdempotentParameterMismatchException(
        `Request parameters differ from the request already made with the ` +
          `ClientRequestToken ${requestToken}`,
      );
    }

    return true;
  }

  /**
   * Remember a transaction that was applied, so a retry does not apply it
   * again.
   */
  record(requestToken: string | undefined, payload: string): void {
    if (requestToken === undefined) {
      return;
    }

    this.records.set(requestToken, { payload, at: this.clock.now() });
  }

  /**
   * The transaction this token stands for, while it still stands for one.
   *
   * A token past the window is forgotten as it is read, so the same token can
   * be used again for something else afterwards.
   */
  private recordUnder(
    requestToken: string,
  ): SimDynamoDbTransactionRecord | undefined {
    const record = this.records.get(requestToken);

    if (record === undefined) {
      return undefined;
    }

    const elapsed = this.clock.now().getTime() - record.at.getTime();

    if (elapsed >= idempotencyWindowMilliseconds) {
      this.records.delete(requestToken);

      return undefined;
    }

    return record;
  }
}

/**
 * Read the ClientRequestToken a request carries, if it carries one.
 */
export function readSimDynamoDbClientRequestToken(
  requestToken: string | undefined,
): string | undefined {
  if (requestToken === undefined) {
    return undefined;
  }

  if (requestToken.length === 0 || requestToken.length > greatestTokenLength) {
    throw new SimDynamoDbValidationException(
      `ClientRequestToken has a length of ${requestToken.length.toString()}, where ` +
        `1 to ${greatestTokenLength.toString()} characters is what DynamoDB ` +
        `takes`,
    );
  }

  return requestToken;
}

/**
 * The request a token stands for, as text two requests can be compared by.
 *
 * The actions are what a retry has to repeat. Comparing them as the JSON they
 * arrived as means a request that names the same things in a different order
 * reads as a different request, which is stricter than comparing them field by
 * field but is what a retry of the same call sends anyway.
 */
export function simDynamoDbTransactionPayload(
  items: readonly SimDynamoDbTransactWriteItem[] | undefined,
): string {
  return JSON.stringify(items ?? []);
}
