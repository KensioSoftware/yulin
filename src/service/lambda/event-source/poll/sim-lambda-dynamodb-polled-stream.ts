import type {
  SimLambdaEventSourceStreamBatch,
  SimLambdaEventSourceStreamPosition,
  SimLambdaEventSourceStreamRequest,
  SimLambdaEventSourceStreams,
  SimLambdaEventSourceStreamWatcher,
} from "../stream/sim-lambda-event-source-streams.js";

/**
 * The one stream a mapping polls.
 *
 * Every call names the same stream, and the ones a poll makes are all made as
 * the function's execution role, so both are fixed here rather than written out
 * at each call. Simulated IAM still decides each one, exactly as real IAM does.
 */
export class SimLambdaDynamoDbPolledStream {
  private readonly streams: SimLambdaEventSourceStreams;
  private readonly streamArn: string;

  constructor(streams: SimLambdaEventSourceStreams, streamArn: string) {
    this.streams = streams;
    this.streamArn = streamArn;
  }

  /**
   * Watch for records being written to the stream.
   */
  watch(watcher: SimLambdaEventSourceStreamWatcher): void {
    this.streams.watch(this.streamArn, watcher);
  }

  /**
   * Stop watching the stream.
   */
  unwatch(watcher: SimLambdaEventSourceStreamWatcher): void {
    this.streams.unwatch(this.streamArn, watcher);
  }

  /**
   * Read up to a batch of records from where the mapping left off.
   */
  async read(
    roleArn: string,
    position: SimLambdaEventSourceStreamPosition,
    batchSize: number,
  ): Promise<SimLambdaEventSourceStreamBatch> {
    return await this.streams.read({
      ...this.requestAs(roleArn),
      position,
      batchSize,
    });
  }

  private requestAs(roleArn: string): SimLambdaEventSourceStreamRequest {
    return { streamArn: this.streamArn, caller: { kind: "arn", arn: roleArn } };
  }
}
