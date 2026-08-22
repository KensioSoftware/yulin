import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * One tag as a CreateStream request carries it.
 */
export type SimKinesisTags = Record<string, string>;

/**
 * How a stream's capacity is declared, as a request carries it.
 */
export interface SimKinesisStreamModeDetails {
  readonly StreamMode?: string | undefined;
}

/**
 * The bounds of one shard's slice of the hash key space, as a request reports
 * them.
 *
 * They are decimal strings rather than numbers, because the space runs to 2^128
 * and a JavaScript number cannot hold that.
 */
export interface SimKinesisHashKeyRangeOutput {
  readonly StartingHashKey: string;
  readonly EndingHashKey: string;
}

/**
 * The sequence numbers one shard spans.
 *
 * An open shard has no ending sequence number, since the next record put would
 * move it. Nothing here closes a shard, so this is always absent.
 */
export interface SimKinesisSequenceNumberRange {
  readonly StartingSequenceNumber: string;
  readonly EndingSequenceNumber?: string | undefined;
}

/**
 * One shard, as DescribeStream reports it.
 */
export interface SimKinesisShardOutput {
  readonly ShardId: string;
  readonly HashKeyRange: SimKinesisHashKeyRangeOutput;
  readonly SequenceNumberRange: SimKinesisSequenceNumberRange;
}

/**
 * Minimal structural sim Kinesis CreateStream command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/CreateStreamCommand/
 */
export interface SimCreateStreamCommand {
  readonly input: SimCreateStreamCommandInput;
}

export interface SimCreateStreamCommandInput {
  readonly StreamName?: string | undefined;
  readonly ShardCount?: number | undefined;
  readonly StreamModeDetails?: SimKinesisStreamModeDetails | undefined;
  readonly Tags?: SimKinesisTags | undefined;
}

export interface SimCreateStreamCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Kinesis DeleteStream command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/DeleteStreamCommand/
 */
export interface SimDeleteStreamCommand {
  readonly input: SimDeleteStreamCommandInput;
}

export interface SimDeleteStreamCommandInput {
  readonly StreamName?: string | undefined;
  readonly StreamARN?: string | undefined;
  readonly EnforceConsumerDeletion?: boolean | undefined;
}

export interface SimDeleteStreamCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Kinesis ListStreams command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/ListStreamsCommand/
 */
export interface SimListStreamsCommand {
  readonly input: SimListStreamsCommandInput;
}

export interface SimListStreamsCommandInput {
  readonly Limit?: number | undefined;
  readonly ExclusiveStartStreamName?: string | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * One stream in a ListStreams response.
 */
export interface SimKinesisStreamSummary {
  readonly StreamName: string;
  readonly StreamARN: string;
  readonly StreamStatus: string;
  readonly StreamModeDetails: SimKinesisStreamModeDetails;
  readonly StreamCreationTimestamp: Date;
}

export interface SimListStreamsCommandOutput {
  readonly StreamNames: readonly string[];
  readonly StreamSummaries: readonly SimKinesisStreamSummary[];
  readonly HasMoreStreams: boolean;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Kinesis DescribeStream command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/DescribeStreamCommand/
 */
export interface SimDescribeStreamCommand {
  readonly input: SimDescribeStreamCommandInput;
}

export interface SimDescribeStreamCommandInput {
  readonly StreamName?: string | undefined;
  readonly StreamARN?: string | undefined;
  readonly Limit?: number | undefined;
  readonly ExclusiveStartShardId?: string | undefined;
}

export interface SimKinesisStreamDescription {
  readonly StreamName: string;
  readonly StreamARN: string;
  readonly StreamStatus: string;
  readonly StreamModeDetails: SimKinesisStreamModeDetails;
  readonly Shards: readonly SimKinesisShardOutput[];
  readonly HasMoreShards: boolean;
  readonly RetentionPeriodHours: number;
  readonly StreamCreationTimestamp: Date;
  readonly EnhancedMonitoring: readonly never[];
}

export interface SimDescribeStreamCommandOutput {
  readonly StreamDescription: SimKinesisStreamDescription;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Kinesis DescribeStreamSummary command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/DescribeStreamSummaryCommand/
 */
export interface SimDescribeStreamSummaryCommand {
  readonly input: SimDescribeStreamSummaryCommandInput;
}

export interface SimDescribeStreamSummaryCommandInput {
  readonly StreamName?: string | undefined;
  readonly StreamARN?: string | undefined;
}

export interface SimKinesisStreamDescriptionSummary {
  readonly StreamName: string;
  readonly StreamARN: string;
  readonly StreamStatus: string;
  readonly StreamModeDetails: SimKinesisStreamModeDetails;
  readonly RetentionPeriodHours: number;
  readonly StreamCreationTimestamp: Date;
  readonly EnhancedMonitoring: readonly never[];
  readonly OpenShardCount: number;
  readonly ConsumerCount: number;
}

export interface SimDescribeStreamSummaryCommandOutput {
  readonly StreamDescriptionSummary: SimKinesisStreamDescriptionSummary;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Kinesis IncreaseStreamRetentionPeriod command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/IncreaseStreamRetentionPeriodCommand/
 */
export interface SimIncreaseStreamRetentionPeriodCommand {
  readonly input: SimStreamRetentionPeriodCommandInput;
}

/**
 * Minimal structural sim Kinesis DecreaseStreamRetentionPeriod command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kinesis/command/DecreaseStreamRetentionPeriodCommand/
 */
export interface SimDecreaseStreamRetentionPeriodCommand {
  readonly input: SimStreamRetentionPeriodCommandInput;
}

export interface SimStreamRetentionPeriodCommandInput {
  readonly StreamName?: string | undefined;
  readonly StreamARN?: string | undefined;
  readonly RetentionPeriodHours?: number | undefined;
}

export interface SimStreamRetentionPeriodCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
