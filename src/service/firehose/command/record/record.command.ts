import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * One record as a put request carries it.
 */
export interface SimFirehoseRecordInput {
  readonly Data?: Uint8Array | undefined;
}

/**
 * Minimal structural sim Firehose PutRecord command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/firehose/command/PutRecordCommand/
 */
export interface SimPutRecordCommand {
  readonly input: SimPutRecordCommandInput;
}

export interface SimPutRecordCommandInput {
  readonly DeliveryStreamName?: string | undefined;
  readonly Record?: SimFirehoseRecordInput | undefined;
}

export interface SimPutRecordCommandOutput {
  readonly RecordId: string;
  readonly Encrypted: boolean;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Firehose PutRecordBatch command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/firehose/command/PutRecordBatchCommand/
 */
export interface SimPutRecordBatchCommand {
  readonly input: SimPutRecordBatchCommandInput;
}

export interface SimPutRecordBatchCommandInput {
  readonly DeliveryStreamName?: string | undefined;
  readonly Records?: readonly SimFirehoseRecordInput[] | undefined;
}

/**
 * What became of one record a PutRecordBatch request carried.
 *
 * A record the delivery stream took carries the id it was given. One it refused
 * carries an error code and message instead, which is how real Firehose reports
 * a record it dropped while accepting the rest of the batch.
 */
export interface SimFirehosePutRecordBatchResponseEntry {
  readonly RecordId?: string | undefined;
  readonly ErrorCode?: string | undefined;
  readonly ErrorMessage?: string | undefined;
}

export interface SimPutRecordBatchCommandOutput {
  readonly FailedPutCount: number;
  readonly Encrypted: boolean;
  readonly RequestResponses: readonly SimFirehosePutRecordBatchResponseEntry[];
  readonly $metadata: SimResponseMetadata;
}
