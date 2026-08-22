import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Kinesis GetShardIterator command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/GetShardIteratorCommand/
 */
export interface SimGetShardIteratorCommand {
  readonly input: SimGetShardIteratorCommandInput;
}

export interface SimGetShardIteratorCommandInput {
  readonly StreamName?: string | undefined;
  readonly StreamARN?: string | undefined;
  readonly ShardId?: string | undefined;
  readonly ShardIteratorType?: string | undefined;
  readonly StartingSequenceNumber?: string | undefined;
  readonly Timestamp?: Date | undefined;
}

export interface SimGetShardIteratorCommandOutput {
  readonly ShardIterator: string;
  readonly $metadata: SimResponseMetadata;
}

/**
 * One record as GetRecords hands it back.
 */
export interface SimKinesisRecordOutput {
  readonly SequenceNumber: string;
  readonly ApproximateArrivalTimestamp: Date;
  readonly Data: Uint8Array;
  readonly PartitionKey: string;
}

/**
 * Minimal structural sim Kinesis GetRecords command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/GetRecordsCommand/
 */
export interface SimGetRecordsCommand {
  readonly input: SimGetRecordsCommandInput;
}

export interface SimGetRecordsCommandInput {
  readonly ShardIterator?: string | undefined;
  readonly Limit?: number | undefined;
  readonly StreamARN?: string | undefined;
}

export interface SimGetRecordsCommandOutput {
  readonly Records: readonly SimKinesisRecordOutput[];
  readonly NextShardIterator: string;
  readonly MillisBehindLatest: number;
  readonly $metadata: SimResponseMetadata;
}
