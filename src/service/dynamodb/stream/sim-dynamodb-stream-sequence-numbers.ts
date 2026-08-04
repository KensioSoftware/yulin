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
