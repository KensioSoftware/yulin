import type { SimDynamoDbStream } from "./sim-dynamodb-stream.js";

/**
 * The streams one simulated DynamoDB holds, keyed by ARN.
 *
 * A stream outlives being enabled: disabling one leaves it readable for the
 * rest of its retention window, and the table that made it has already moved on
 * to reporting nothing or reporting a newer one. So the streams are held here
 * rather than only on the tables, which is what lets an ARN be resolved to the
 * stream it names however long ago the table stopped writing to it.
 */
export class SimDynamoDbStreamStore {
  private readonly streams = new Map<string, SimDynamoDbStream>();

  /**
   * Hold a stream a table has just enabled.
   */
  add(stream: SimDynamoDbStream): void {
    this.streams.set(stream.arn, stream);
  }

  /**
   * Find the stream an ARN names, if there is one.
   *
   * An ARN naming no stream is simply not found. It reaches this from request
   * input, where a value that names nothing is an ordinary case the caller
   * reports in its own terms.
   */
  findByArn(streamArn: string): SimDynamoDbStream | undefined {
    return this.streams.get(streamArn);
  }

  /**
   * Every stream here, in ARN order.
   *
   * ListStreams pages by ARN, so the order a page is cut out of has to be the
   * order the paging parameter walks. A stream's ARN is its table's ARN and
   * then the instant it was enabled, so this also groups a table's streams
   * together, oldest first.
   */
  inArnOrder(): readonly SimDynamoDbStream[] {
    return this.streams
      .values()
      .toArray()
      .toSorted((left, right) => left.arn.localeCompare(right.arn));
  }

  /**
   * Bring every stream here up to date at an instant.
   *
   * All of them rather than the one being read, so that what a test sees of one
   * stream does not depend on which other streams it happened to read first.
   */
  applyRetention(instant: Date): void {
    for (const stream of this.streams.values()) {
      stream.applyRetention(instant);
    }
  }
}
