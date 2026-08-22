import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Kinesis PutRecord command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/PutRecordCommand/
 */
export interface SimPutRecordCommand {
  readonly input: SimPutRecordCommandInput;
}

export interface SimPutRecordCommandInput {
  readonly StreamName?: string | undefined;
  readonly StreamARN?: string | undefined;
  readonly Data?: Uint8Array | undefined;
  readonly PartitionKey?: string | undefined;
  readonly ExplicitHashKey?: string | undefined;
  readonly SequenceNumberForOrdering?: string | undefined;
}

export interface SimPutRecordCommandOutput {
  readonly ShardId: string;
  readonly SequenceNumber: string;
  readonly $metadata: SimResponseMetadata;
}

/**
 * One record as a PutRecords request carries it.
 */
export interface SimKinesisPutRecordsRequestEntry {
  readonly Data?: Uint8Array | undefined;
  readonly PartitionKey?: string | undefined;
  readonly ExplicitHashKey?: string | undefined;
}

/**
 * Minimal structural sim Kinesis PutRecords command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/PutRecordsCommand/
 */
export interface SimPutRecordsCommand {
  readonly input: SimPutRecordsCommandInput;
}

export interface SimPutRecordsCommandInput {
  readonly StreamName?: string | undefined;
  readonly StreamARN?: string | undefined;
  readonly Records?: readonly SimKinesisPutRecordsRequestEntry[] | undefined;
}

/**
 * What became of one record a PutRecords request carried.
 *
 * A record that went on the stream carries the shard it landed on and the
 * sequence number it took. One that did not carries an error code and message
 * instead, which is how real Kinesis reports a record it dropped while
 * accepting the rest of the batch.
 */
export interface SimKinesisPutRecordsResultEntry {
  readonly ShardId?: string | undefined;
  readonly SequenceNumber?: string | undefined;
  readonly ErrorCode?: string | undefined;
  readonly ErrorMessage?: string | undefined;
}

export interface SimPutRecordsCommandOutput {
  readonly FailedRecordCount: number;
  readonly Records: readonly SimKinesisPutRecordsResultEntry[];
  readonly $metadata: SimResponseMetadata;
}
