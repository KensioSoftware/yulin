import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * What DescribeDeliverySources reports about one delivery source.
 */
export interface SimLogsDeliverySourceDetail {
  readonly name: string;
  readonly arn: string;
  readonly resourceArns: readonly string[];
  readonly service: string;
  readonly logType: string;
}

/**
 * Minimal structural sim CloudWatch Logs PutDeliverySource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/PutDeliverySourceCommand/
 */
export interface SimPutDeliverySourceCommand {
  readonly input: SimPutDeliverySourceCommandInput;
}

export interface SimPutDeliverySourceCommandInput {
  readonly name?: string | undefined;
  readonly resourceArn?: string | undefined;
  readonly logType?: string | undefined;
  readonly tags?: Record<string, string> | undefined;
}

export interface SimPutDeliverySourceCommandOutput {
  readonly deliverySource?: SimLogsDeliverySourceDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DescribeDeliverySources command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DescribeDeliverySourcesCommand/
 */
export interface SimDescribeDeliverySourcesCommand {
  readonly input: SimDescribeDeliverySourcesCommandInput;
}

export interface SimDescribeDeliverySourcesCommandInput {
  readonly limit?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface SimDescribeDeliverySourcesCommandOutput {
  readonly deliverySources?: readonly SimLogsDeliverySourceDetail[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DeleteDeliverySource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DeleteDeliverySourceCommand/
 */
export interface SimDeleteDeliverySourceCommand {
  readonly input: SimDeleteDeliverySourceCommandInput;
}

export interface SimDeleteDeliverySourceCommandInput {
  readonly name?: string | undefined;
}

export interface SimDeleteDeliverySourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
