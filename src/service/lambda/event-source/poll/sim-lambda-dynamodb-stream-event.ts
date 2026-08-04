import type { SimLambdaDynamoDbStreamEventSourceArn } from "../stream/sim-lambda-dynamodb-stream-event-source-arn.js";
import type { SimLambdaDynamoDbImage } from "../stream/sim-lambda-dynamodb-attribute-value.js";
import type {
  SimLambdaEventSourceStreamRecord,
  SimLambdaEventSourceStreamRecordBody,
} from "../stream/sim-lambda-event-source-streams.js";

const millisecondsPerSecond = 1000;

/**
 * The change one record reports, as a DynamoDB stream event record carries it.
 *
 * The field names are the Streams API's, capital and all, because that is what
 * the event carries. `ApproximateCreationDateTime` is the exception: the API
 * gives an instant and the event gives whole seconds since the epoch.
 */
export interface SimLambdaDynamoDbStreamEventRecordBody {
  readonly ApproximateCreationDateTime?: number | undefined;
  readonly Keys?: SimLambdaDynamoDbImage | undefined;
  readonly NewImage?: SimLambdaDynamoDbImage | undefined;
  readonly OldImage?: SimLambdaDynamoDbImage | undefined;
  readonly SequenceNumber: string;
  readonly SizeBytes: number;
  readonly StreamViewType: string;
}

/**
 * Who made the change a record reports, when it was not the application.
 *
 * A time to live deletion is the one that carries this. The Streams API
 * capitalizes the same two fields; the event does not.
 */
export interface SimLambdaDynamoDbStreamEventUserIdentity {
  readonly type: string;
  readonly principalId: string;
}

/**
 * One stream record as a DynamoDB stream event record.
 *
 * https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html
 */
export interface SimLambdaDynamoDbStreamEventRecord {
  readonly eventID: string;
  readonly eventName: string;
  readonly eventVersion: string;
  readonly eventSource: "aws:dynamodb";
  readonly awsRegion: string;
  readonly dynamodb: SimLambdaDynamoDbStreamEventRecordBody;
  readonly eventSourceARN: string;
  readonly userIdentity?: SimLambdaDynamoDbStreamEventUserIdentity | undefined;
}

/**
 * The event a DynamoDB stream event source mapping invokes a function with.
 */
export interface SimLambdaDynamoDbStreamEvent {
  readonly Records: readonly SimLambdaDynamoDbStreamEventRecord[];
}

/**
 * Builds the DynamoDB stream event for one batch of polled records.
 *
 * The casing here is the event's own and is not a tidy scheme: `eventID` has a
 * capital ID, `dynamodb` has none, `eventSourceARN` has a capital ARN, the
 * block inside `dynamodb` is capitalized and `userIdentity` is not. All of it
 * is what a function actually receives, so all of it is written out.
 */
export class SimLambdaDynamoDbStreamEventBuilder {
  private readonly eventSourceArn: SimLambdaDynamoDbStreamEventSourceArn;

  constructor(eventSourceArn: SimLambdaDynamoDbStreamEventSourceArn) {
    this.eventSourceArn = eventSourceArn;
  }

  /**
   * The event for a batch of records.
   */
  of(
    records: readonly SimLambdaEventSourceStreamRecord[],
  ): SimLambdaDynamoDbStreamEvent {
    return { Records: records.map((record) => this.record(record)) };
  }

  private record(
    record: SimLambdaEventSourceStreamRecord,
  ): SimLambdaDynamoDbStreamEventRecord {
    const identity = record.userIdentity;

    return {
      eventID: record.eventID ?? "",
      eventName: record.eventName ?? "",
      eventVersion: record.eventVersion ?? "",
      eventSource: "aws:dynamodb",
      awsRegion: record.awsRegion ?? this.eventSourceArn.regionName,
      dynamodb: eventRecordBody(record.dynamodb),
      eventSourceARN: this.eventSourceArn.value,
      ...(identity !== undefined && {
        userIdentity: {
          type: identity.Type ?? "",
          principalId: identity.PrincipalId ?? "",
        },
      }),
    };
  }
}

/**
 * The change block of an event record, with only the images the stream's view
 * type gave it.
 */
function eventRecordBody(
  body: SimLambdaEventSourceStreamRecordBody | undefined,
): SimLambdaDynamoDbStreamEventRecordBody {
  const createdAt = body?.ApproximateCreationDateTime;

  return {
    ...(createdAt !== undefined && {
      ApproximateCreationDateTime: Math.floor(
        createdAt.getTime() / millisecondsPerSecond,
      ),
    }),
    ...(body?.Keys !== undefined && { Keys: body.Keys }),
    ...(body?.NewImage !== undefined && { NewImage: body.NewImage }),
    ...(body?.OldImage !== undefined && { OldImage: body.OldImage }),
    SequenceNumber: body?.SequenceNumber ?? "",
    SizeBytes: body?.SizeBytes ?? 0,
    StreamViewType: body?.StreamViewType ?? "",
  };
}
