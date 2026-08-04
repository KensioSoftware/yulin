import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * The number the first record on a stream is given.
 *
 * A sequence number is compared as text by anything reading a stream, so the
 * width has to be fixed and the first digit has to be something other than a
 * zero. Starting at 10^20 gives 21 digits of room, which is a hundred billion
 * billion records before the width changes.
 */
const firstSequenceNumber = 100_000_000_000_000_000_000n;

/**
 * The sequence numbers one stream hands out.
 *
 * This is a counter rather than a clock. Records are commonly written inside
 * one millisecond, and a clock cannot tell those apart, so a clock-derived
 * sequence number would leave two records claiming the same position on the
 * stream. Real DynamoDB varies the width between 21 and 40 digits, where these
 * stay at 21, which is a divergence in a reader's favour: lexicographic order
 * is numeric order here whatever two numbers are compared.
 */
export class SimDynamoDbStreamSequenceNumbers {
  private next = firstSequenceNumber;

  /**
   * Take the next sequence number, as the text a record carries.
   */
  take(): string {
    const taken = this.next;

    this.next += 1n;

    return taken.toString();
  }
}

/**
 * A sequence number is digits and nothing else.
 */
const digitsOnly = /^\d+$/u;

/**
 * Read a sequence number a request carries.
 *
 * Real DynamoDB refuses anything that is not a run of digits, so a caller that
 * passes a shard identifier or a truncated value here finds out at the request
 * rather than reading from a position nothing could ever be at.
 */
export function readSimDynamoDbSequenceNumber(
  value: string | undefined,
  operationName: string,
): string {
  if (value === undefined || !digitsOnly.test(value)) {
    throw new SimDynamoDbValidationException(
      `${operationName} needs a numeric SequenceNumber`,
    );
  }

  return value;
}

/**
 * Order two sequence numbers, as a comparator does.
 *
 * These are compared as numbers rather than as text. The ones a simulated
 * stream hands out are a fixed width, where the two orders agree, but one a
 * request carries came from outside and need not be.
 */
export function compareSimDynamoDbSequenceNumbers(
  left: string,
  right: string,
): number {
  const difference = BigInt(left) - BigInt(right);

  if (difference === 0n) {
    return 0;
  }

  return difference > 0n ? 1 : -1;
}
