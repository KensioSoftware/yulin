import type { SimLambdaDynamoDbStreamEventSourceArn } from "../stream/sim-lambda-dynamodb-stream-event-source-arn.js";
import { simLambdaDynamoDbEventImages } from "./sim-lambda-dynamodb-event-image.js";
import type {
  SimLambdaDynamoDbStreamEvent,
  SimLambdaDynamoDbStreamEventRecord,
  SimLambdaDynamoDbStreamEventRecordBody,
} from "./sim-lambda-dynamodb-stream-event.types.js";
import type {
  SimLambdaEventSourceStreamRecord,
  SimLambdaEventSourceStreamRecordBody,
} from "../stream/sim-lambda-event-source-streams.js";

const millisecondsPerSecond = 1000;

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
 * The change block of an event record.
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
    ...simLambdaDynamoDbEventImages(body),
    SequenceNumber: body?.SequenceNumber ?? "",
    SizeBytes: body?.SizeBytes ?? 0,
    StreamViewType: body?.StreamViewType ?? "",
  };
}
