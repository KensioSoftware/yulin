/**
 * The Kinesis part of one event record.
 *
 * The casing here is the event's own. Everything inside `kinesis` is
 * lower-cased, unlike the DynamoDB stream event, whose inner block is
 * capitalized.
 */
export interface SimLambdaKinesisStreamEventRecordBody {
  readonly kinesisSchemaVersion: string;
  readonly partitionKey: string;
  readonly sequenceNumber: string;
  readonly data: string;
  readonly approximateArrivalTimestamp: number;
}

/**
 * One record as a function receives it from a Kinesis event source.
 */
export interface SimLambdaKinesisStreamEventRecord {
  readonly eventID: string;
  readonly eventName: string;
  readonly eventVersion: string;
  readonly eventSource: "aws:kinesis";
  readonly awsRegion: string;
  readonly kinesis: SimLambdaKinesisStreamEventRecordBody;
  readonly eventSourceARN: string;
  readonly invokeIdentityArn: string;
}

/**
 * The event a function receives from a Kinesis event source mapping.
 */
export interface SimLambdaKinesisStreamEvent {
  readonly Records: readonly SimLambdaKinesisStreamEventRecord[];
}
