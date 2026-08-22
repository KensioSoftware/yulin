import { SimLambdaError } from "../../../error/sim-lambda.error.js";
import type { SimLambdaEventSourceStreamRequest } from "../sim-lambda-event-source-streams.js";
import type {
  SimLambdaKinesisShardReadRequest,
  SimLambdaKinesisStreamBatch,
  SimLambdaKinesisStreams,
} from "./sim-lambda-kinesis-streams.js";

/**
 * Kinesis event source streams used when no simulated Kinesis is wired up, such
 * as for a standalone SimLambda constructed outside SimAws.
 */
export class SimLambdaNoKinesisStreams implements SimLambdaKinesisStreams {
  /**
   * Refuse to look at a stream, explaining how to reach one.
   */
  shardIds(
    request: SimLambdaEventSourceStreamRequest,
  ): Promise<readonly string[]> {
    return Promise.reject(this.noStreams(request.streamArn));
  }

  /**
   * Refuse to poll, explaining how to reach a stream.
   */
  read(
    request: SimLambdaKinesisShardReadRequest,
  ): Promise<SimLambdaKinesisStreamBatch> {
    return Promise.reject(this.noStreams(request.streamArn));
  }

  /**
   * Watch nothing: there is no stream to watch.
   */
  watch(): void {
    //
  }

  /**
   * Stop watching nothing.
   */
  unwatch(): void {
    //
  }

  private noStreams(streamArn: string): SimLambdaError {
    return new SimLambdaError(
      `Cannot poll ${streamArn}: this SimLambda has no simulated Kinesis to ` +
        "poll. Create the event source mapping through SimAws, or construct " +
        "SimLambda with kinesisStreams.",
    );
  }
}
