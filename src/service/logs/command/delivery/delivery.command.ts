import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * How a delivery lays out what it writes into an S3 bucket.
 */
export interface SimLogsS3DeliveryConfiguration {
  readonly suffixPath?: string | undefined;
  readonly enableHiveCompatiblePath?: boolean | undefined;
}

/**
 * What DescribeDeliveries reports about one delivery.
 */
export interface SimLogsDeliveryDetail {
  readonly id: string;
  readonly arn: string;
  readonly deliverySourceName: string;
  readonly deliveryDestinationArn: string;
  readonly deliveryDestinationType: string;
  readonly recordFields?: readonly string[] | undefined;
  readonly fieldDelimiter?: string | undefined;
  readonly s3DeliveryConfiguration?: SimLogsS3DeliveryConfiguration | undefined;
}

/**
 * Minimal structural sim CloudWatch Logs CreateDelivery command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/CreateDeliveryCommand/
 */
export interface SimCreateDeliveryCommand {
  readonly input: SimCreateDeliveryCommandInput;
}

export interface SimCreateDeliveryCommandInput {
  readonly deliverySourceName?: string | undefined;
  readonly deliveryDestinationArn?: string | undefined;
  readonly recordFields?: readonly string[] | undefined;
  readonly fieldDelimiter?: string | undefined;
  readonly s3DeliveryConfiguration?: SimLogsS3DeliveryConfiguration | undefined;
  readonly tags?: Record<string, string> | undefined;
}

export interface SimCreateDeliveryCommandOutput {
  readonly delivery?: SimLogsDeliveryDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DescribeDeliveries command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DescribeDeliveriesCommand/
 */
export interface SimDescribeDeliveriesCommand {
  readonly input: SimDescribeDeliveriesCommandInput;
}

export interface SimDescribeDeliveriesCommandInput {
  readonly limit?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface SimDescribeDeliveriesCommandOutput {
  readonly deliveries?: readonly SimLogsDeliveryDetail[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DeleteDelivery command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DeleteDeliveryCommand/
 */
export interface SimDeleteDeliveryCommand {
  readonly input: SimDeleteDeliveryCommandInput;
}

export interface SimDeleteDeliveryCommandInput {
  readonly id?: string | undefined;
}

export interface SimDeleteDeliveryCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
