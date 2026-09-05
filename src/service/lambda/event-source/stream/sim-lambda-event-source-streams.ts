import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimLambdaError } from "../../error/sim-lambda.error.js";
import type { SimLambdaEventSourceStart } from "../sim-lambda-event-source-starting-position.js";
import type { SimLambdaDynamoDbImage } from "./sim-lambda-dynamodb-attribute-value.js";

/**
 * The change one stream record reports, as the stream hands it out.
 *
 * These are the Streams API's own names for the parts of a record. Turning them
 * into the event a function sees is the event builder's job, and it is a real
 * translation rather than a copy: the API capitalizes the identity and gives an
 * instant where the event lower-cases the identity and gives epoch seconds.
 */
export interface SimLambdaEventSourceStreamRecordBody {
  readonly ApproximateCreationDateTime?: Date | undefined;
  readonly Keys?: SimLambdaDynamoDbImage | undefined;
  readonly NewImage?: SimLambdaDynamoDbImage | undefined;
  readonly OldImage?: SimLambdaDynamoDbImage | undefined;
  readonly SequenceNumber?: string | undefined;
  readonly SizeBytes?: number | undefined;
  readonly StreamViewType?: string | undefined;
}

/**
 * Who made a change, when it was not the application.
 */
export interface SimLambdaEventSourceStreamIdentity {
  readonly PrincipalId?: string | undefined;
  readonly Type?: string | undefined;
}

/**
 * One record as a stream hands it to a poller.
 */
export interface SimLambdaEventSourceStreamRecord {
  readonly eventID?: string | undefined;
  readonly eventName?: string | undefined;
  readonly eventVersion?: string | undefined;
  readonly awsRegion?: string | undefined;
  readonly dynamodb?: SimLambdaEventSourceStreamRecordBody | undefined;
  readonly userIdentity?: SimLambdaEventSourceStreamIdentity | undefined;
}

/**
 * Where a mapping has reached on the stream it polls.
 *
 * A mapping that has read nothing yet has only the starting position it was
 * created with. One that has read something holds the shard iterator the last
 * read handed back, which is the place itself rather than a description of it.
 *
 * A sequence number is the third, and it is a place the mapping has already
 * been: a function that reported failing partway through a batch sends the
 * mapping back to the record it named, and reading starts at that record rather
 * than after it.
 */
export type SimLambdaEventSourceStreamPosition =
  | { readonly kind: "starting"; readonly start: SimLambdaEventSourceStart }
  | { readonly kind: "iterator"; readonly shardIterator: string }
  | { readonly kind: "sequence"; readonly sequenceNumber: string };

/**
 * A poller's request to the stream it polls, made as the function's execution
 * role so simulated IAM applies to it as it does on real Lambda.
 */
export interface SimLambdaEventSourceStreamRequest {
  readonly streamArn: string;
  readonly caller: SimAwsCaller;
}

export interface SimLambdaEventSourceStreamReadRequest extends SimLambdaEventSourceStreamRequest {
  readonly position: SimLambdaEventSourceStreamPosition;
  readonly batchSize: number;
}

/**
 * Where a read left the reader, apart from what it read.
 *
 * This is all the progress of a mapping depends on, and it is the same for
 * every stream service. The records a batch carried are the service's own
 * shape, so they stay with the batch types below.
 *
 * `drained` is only true of a shard the reader has reached the end of, which
 * happens when the table's stream has been switched off. An empty batch from an
 * open shard is the ordinary answer for a mapping that has caught up.
 */
export interface SimLambdaEventSourceStreamProgressBatch {
  readonly next: SimLambdaEventSourceStreamPosition;
  readonly drained: boolean;
  readonly shardId?: string;
}

/**
 * What one read of a DynamoDB stream came back with.
 */
export interface SimLambdaEventSourceStreamBatch extends SimLambdaEventSourceStreamProgressBatch {
  readonly records: readonly SimLambdaEventSourceStreamRecord[];
}

/**
 * Something watching a stream on a poller's behalf.
 */
export interface SimLambdaEventSourceStreamWatcher {
  /**
   * A record has been written and can be read now.
   *
   * There is no instant here, unlike the queue watcher this mirrors: a stream
   * record is readable the moment it is written.
   */
  recordsAvailable(): void;
}

/**
 * The streams a simulated Lambda event source mapping polls.
 *
 * This is the narrow slice of simulated DynamoDB Streams that polling needs,
 * kept as an interface so Lambda depends on what it does with a stream rather
 * than on the DynamoDB service object. Every operation carries the caller,
 * because polling on real Lambda is done with the function's execution role and
 * is refused when that role has no permission for it.
 */
export interface SimLambdaEventSourceStreams {
  /**
   * The table whose changes a stream carries, and by asking, whether the
   * stream is there to be polled at all.
   */
  tableName(request: SimLambdaEventSourceStreamRequest): Promise<string>;

  /**
   * Read up to a batch of records from where a position left off.
   */
  read(
    request: SimLambdaEventSourceStreamReadRequest,
  ): Promise<SimLambdaEventSourceStreamBatch>;

  /**
   * Watch a stream for the records written to it.
   */
  watch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void;

  /**
   * Stop watching a stream.
   */
  unwatch(streamArn: string, watcher: SimLambdaEventSourceStreamWatcher): void;
}

/**
 * Event source streams used when no simulated DynamoDB is wired up, such as for
 * a standalone SimLambda constructed outside SimAws.
 */
export class SimLambdaNoEventSourceStreams implements SimLambdaEventSourceStreams {
  /**
   * Refuse to look at a stream, explaining how to reach one.
   */
  tableName(request: SimLambdaEventSourceStreamRequest): Promise<string> {
    return Promise.reject(this.noStreams(request.streamArn));
  }

  /**
   * Refuse to poll, explaining how to reach a stream.
   */
  read(
    request: SimLambdaEventSourceStreamReadRequest,
  ): Promise<SimLambdaEventSourceStreamBatch> {
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
      `Cannot poll ${streamArn}: this SimLambda has no simulated DynamoDB to ` +
        "poll. Create the event source mapping through SimAws, or construct " +
        "SimLambda with eventSourceStreams.",
    );
  }
}
