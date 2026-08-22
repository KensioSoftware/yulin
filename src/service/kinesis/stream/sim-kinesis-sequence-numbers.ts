/**
 * The number the first record on a stream is given.
 *
 * A sequence number is compared as text by anything reading a stream, so the
 * width has to be fixed and the first digit has to be something other than a
 * zero. Real Kinesis hands out 56 digit numbers, and starting at 10^55 gives
 * that width with room for more records than any simulation will write.
 */
const firstSequenceNumber = 10n ** 55n;

/**
 * The sequence numbers one stream hands out.
 *
 * This is a counter rather than a clock. Records are commonly put inside one
 * millisecond, and a clock cannot tell those apart, which would leave two
 * records claiming the same position on the stream.
 *
 * One counter serves the whole stream rather than one per shard. Real Kinesis
 * promises a sequence number is unique within a stream and increases within a
 * shard, and a single counter gives both. It also means two records on
 * different shards can be ordered against each other here, which real Kinesis
 * does not promise. A consumer relying on that would be relying on something
 * AWS does not offer.
 */
export class SimKinesisSequenceNumbers {
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
 * Order two sequence numbers.
 *
 * They are compared as numbers rather than as text. The width is fixed while a
 * simulation runs, so the two orders agree, and comparing the values keeps that
 * true if the width ever changes.
 */
export function compareSimKinesisSequenceNumbers(
  left: string,
  right: string,
): number {
  const difference = BigInt(left) - BigInt(right);

  if (difference === 0n) {
    return 0;
  }

  return difference > 0n ? 1 : -1;
}
