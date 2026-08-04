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
}
