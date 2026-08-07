import type { SimArn } from "../../../aws/arn.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";
import type { SimDynamoDbKeySchemaElement } from "../table/table.types.js";
import type { SimDynamoDbStreamViewType } from "../../stream/sim-dynamodb-stream.types.js";

/**
 * Minimal structural sim DynamoDB Streams stream summary, as ListStreams
 * reports one.
 */
export interface SimDynamoDbStreamSummary {
  readonly StreamArn?: SimArn | undefined;
  readonly TableName?: string | undefined;
  readonly StreamLabel?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams sequence number range.
 *
 * `EndingSequenceNumber` is absent from an open shard, which is how a reader
 * tells a shard still taking changes from one it can finish with.
 */
export interface SimDynamoDbStreamSequenceNumberRange {
  readonly StartingSequenceNumber?: string | undefined;
  readonly EndingSequenceNumber?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams shard.
 *
 * A simulated stream has one shard and never splits, so no shard here has a
 * `ParentShardId`.
 */
export interface SimDynamoDbStreamShardDescription {
  readonly ShardId?: string | undefined;
  readonly SequenceNumberRange?:
    | SimDynamoDbStreamSequenceNumberRange
    | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams stream description.
 */
export interface SimDynamoDbStreamDescription {
  readonly StreamArn?: SimArn | undefined;
  readonly StreamLabel?: string | undefined;
  readonly StreamStatus?: string | undefined;
  readonly StreamViewType?: SimDynamoDbStreamViewType | undefined;
  readonly CreationRequestDateTime?: Date | undefined;
  readonly TableName?: string | undefined;
  readonly KeySchema?: readonly SimDynamoDbKeySchemaElement[] | undefined;
  readonly Shards?: readonly SimDynamoDbStreamShardDescription[] | undefined;
  readonly LastEvaluatedShardId?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams identity.
 *
 * The Streams API capitalizes these, where the Lambda event that carries the
 * same records does not. That is the whole reason a captured record is kept as
 * a domain object with a renderer over it rather than as one payload shared
 * between the two surfaces.
 */
export interface SimDynamoDbStreamsIdentity {
  readonly PrincipalId?: string | undefined;
  readonly Type?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams stream record body.
 */
export interface SimDynamoDbStreamsRecordBody {
  readonly ApproximateCreationDateTime?: Date | undefined;
  readonly Keys?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
  readonly NewImage?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
  readonly OldImage?:
    | Readonly<Record<string, SimDynamoDbAttributeValue>>
    | undefined;
  readonly SequenceNumber?: string | undefined;
  readonly SizeBytes?: number | undefined;
  readonly StreamViewType?: SimDynamoDbStreamViewType | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams record, as GetRecords hands one back.
 */
export interface SimDynamoDbStreamsRecord {
  readonly eventID?: string | undefined;
  readonly eventName?: string | undefined;
  readonly eventVersion?: string | undefined;
  readonly eventSource?: string | undefined;
  readonly awsRegion?: string | undefined;
  readonly dynamodb?: SimDynamoDbStreamsRecordBody | undefined;
  readonly userIdentity?: SimDynamoDbStreamsIdentity | undefined;
}
