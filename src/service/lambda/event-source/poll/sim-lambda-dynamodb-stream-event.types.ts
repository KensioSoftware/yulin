/**
 * The shape of the event a DynamoDB stream event source mapping invokes a
 * function with.
 *
 * https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html
 */

/**
 * One attribute value as a DynamoDB stream event carries it.
 *
 * The tags are the ones DynamoDB names its types with, and every one of them is
 * optional, which is how the `aws-lambda` typings declare a stream event's
 * attribute values. Binary is a base64 string rather than bytes, because the
 * event reaches a function as JSON, and JSON has no bytes.
 */
export interface SimLambdaDynamoDbEventAttributeValue {
  readonly B?: string | undefined;
  readonly BOOL?: boolean | undefined;
  readonly BS?: readonly string[] | undefined;
  readonly L?: readonly SimLambdaDynamoDbEventAttributeValue[] | undefined;
  readonly M?: SimLambdaDynamoDbEventImage | undefined;
  readonly N?: string | undefined;
  readonly NS?: readonly string[] | undefined;
  readonly NULL?: boolean | undefined;
  readonly S?: string | undefined;
  readonly SS?: readonly string[] | undefined;
}

/**
 * One item image as a DynamoDB stream event carries it.
 */
export type SimLambdaDynamoDbEventImage = Readonly<
  Record<string, SimLambdaDynamoDbEventAttributeValue>
>;

/**
 * The change one record reports, as a DynamoDB stream event record carries it.
 *
 * The field names are the Streams API's, capital and all, because that is what
 * the event carries. `ApproximateCreationDateTime` is the exception: the API
 * gives an instant and the event gives whole seconds since the epoch.
 */
export interface SimLambdaDynamoDbStreamEventRecordBody {
  readonly ApproximateCreationDateTime?: number | undefined;
  readonly Keys?: SimLambdaDynamoDbEventImage | undefined;
  readonly NewImage?: SimLambdaDynamoDbEventImage | undefined;
  readonly OldImage?: SimLambdaDynamoDbEventImage | undefined;
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
