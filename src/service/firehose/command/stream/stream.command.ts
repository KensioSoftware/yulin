import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimFirehoseDestinationInput } from "../../destination/sim-firehose-destination-choice.js";
import type { SimFirehoseSourceInput } from "../../source/sim-firehose-source-choice.js";

/**
 * One tag as a CreateDeliveryStream request carries it.
 */
export interface SimFirehoseTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim Firehose CreateDeliveryStream command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/firehose/command/CreateDeliveryStreamCommand/
 */
export interface SimCreateDeliveryStreamCommand {
  readonly input: SimCreateDeliveryStreamCommandInput;
}

export interface SimCreateDeliveryStreamCommandInput
  extends SimFirehoseDestinationInput, SimFirehoseSourceInput {
  readonly DeliveryStreamName?: string | undefined;
  readonly DeliveryStreamEncryptionConfigurationInput?: unknown;
  readonly Tags?: readonly SimFirehoseTag[] | undefined;
}

export interface SimCreateDeliveryStreamCommandOutput {
  readonly DeliveryStreamARN: string;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Firehose DeleteDeliveryStream command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/firehose/command/DeleteDeliveryStreamCommand/
 */
export interface SimDeleteDeliveryStreamCommand {
  readonly input: SimDeleteDeliveryStreamCommandInput;
}

export interface SimDeleteDeliveryStreamCommandInput {
  readonly DeliveryStreamName?: string | undefined;
  readonly AllowForceDelete?: boolean | undefined;
}

export interface SimDeleteDeliveryStreamCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Firehose ListDeliveryStreams command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/firehose/command/ListDeliveryStreamsCommand/
 */
export interface SimListDeliveryStreamsCommand {
  readonly input: SimListDeliveryStreamsCommandInput;
}

export interface SimListDeliveryStreamsCommandInput {
  readonly Limit?: number | undefined;
  readonly DeliveryStreamType?: string | undefined;
  readonly ExclusiveStartDeliveryStreamName?: string | undefined;
}

export interface SimListDeliveryStreamsCommandOutput {
  readonly DeliveryStreamNames: readonly string[];
  readonly HasMoreDeliveryStreams: boolean;
  readonly $metadata: SimResponseMetadata;
}

/**
 * How a delivery stream reports its buffering, as DescribeDeliveryStream gives
 * it back.
 */
export interface SimFirehoseBufferingHintsOutput {
  readonly SizeInMBs: number;
  readonly IntervalInSeconds: number;
}

/**
 * One S3 destination, as DescribeDeliveryStream reports it.
 */
export interface SimFirehoseExtendedS3DestinationDescription {
  readonly RoleARN: string;
  readonly BucketARN: string;
  readonly Prefix: string;
  readonly ErrorOutputPrefix?: string | undefined;
  readonly BufferingHints: SimFirehoseBufferingHintsOutput;
  readonly CompressionFormat: string;
}

/**
 * One destination of a delivery stream, as DescribeDeliveryStream reports it.
 */
export interface SimFirehoseDestinationDescription {
  readonly DestinationId: string;
  readonly ExtendedS3DestinationDescription: SimFirehoseExtendedS3DestinationDescription;
}

/**
 * The Kinesis stream a delivery stream reads, as DescribeDeliveryStream reports
 * it.
 */
export interface SimFirehoseKinesisStreamSourceDescription {
  readonly KinesisStreamARN: string;
  readonly RoleARN: string;
  readonly DeliveryStartTimestamp: Date;
}

/**
 * Where a delivery stream's records come from, as DescribeDeliveryStream
 * reports it.
 *
 * A `DirectPut` delivery stream reports no source at all, as it does on real
 * Firehose. Nothing put the records there but the producer.
 */
export interface SimFirehoseSourceDescription {
  readonly KinesisStreamSourceDescription: SimFirehoseKinesisStreamSourceDescription;
}

/**
 * One delivery stream, as DescribeDeliveryStream reports it.
 */
export interface SimFirehoseDeliveryStreamDescription {
  readonly DeliveryStreamName: string;
  readonly DeliveryStreamARN: string;
  readonly DeliveryStreamStatus: string;
  readonly DeliveryStreamType: string;
  readonly VersionId: string;
  readonly CreateTimestamp: Date;
  readonly Source?: SimFirehoseSourceDescription | undefined;
  readonly Destinations: readonly SimFirehoseDestinationDescription[];
  readonly HasMoreDestinations: boolean;
}

/**
 * Minimal structural sim Firehose DescribeDeliveryStream command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/firehose/command/DescribeDeliveryStreamCommand/
 */
export interface SimDescribeDeliveryStreamCommand {
  readonly input: SimDescribeDeliveryStreamCommandInput;
}

export interface SimDescribeDeliveryStreamCommandInput {
  readonly DeliveryStreamName?: string | undefined;
  readonly Limit?: number | undefined;
  readonly ExclusiveStartDestinationId?: string | undefined;
}

export interface SimDescribeDeliveryStreamCommandOutput {
  readonly DeliveryStreamDescription: SimFirehoseDeliveryStreamDescription;
  readonly $metadata: SimResponseMetadata;
}
