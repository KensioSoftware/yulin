import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Which resource a delivery destination writes into.
 */
export interface SimLogsDeliveryDestinationConfiguration {
  readonly destinationResourceArn?: string | undefined;
}

/**
 * What DescribeDeliveryDestinations reports about one delivery destination.
 */
export interface SimLogsDeliveryDestinationDetail {
  readonly name: string;
  readonly arn: string;
  readonly deliveryDestinationType: string;
  readonly outputFormat: string;
  readonly deliveryDestinationConfiguration: SimLogsDeliveryDestinationConfiguration;
}

/**
 * Minimal structural sim CloudWatch Logs PutDeliveryDestination command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/PutDeliveryDestinationCommand/
 */
export interface SimPutDeliveryDestinationCommand {
  readonly input: SimPutDeliveryDestinationCommandInput;
}

export interface SimPutDeliveryDestinationCommandInput {
  readonly name?: string | undefined;
  readonly outputFormat?: string | undefined;
  readonly deliveryDestinationConfiguration?:
    | SimLogsDeliveryDestinationConfiguration
    | undefined;
  readonly tags?: Record<string, string> | undefined;
}

export interface SimPutDeliveryDestinationCommandOutput {
  readonly deliveryDestination?: SimLogsDeliveryDestinationDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DescribeDeliveryDestinations command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DescribeDeliveryDestinationsCommand/
 */
export interface SimDescribeDeliveryDestinationsCommand {
  readonly input: SimDescribeDeliveryDestinationsCommandInput;
}

export interface SimDescribeDeliveryDestinationsCommandInput {
  readonly limit?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface SimDescribeDeliveryDestinationsCommandOutput {
  readonly deliveryDestinations?:
    | readonly SimLogsDeliveryDestinationDetail[]
    | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DeleteDeliveryDestination command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DeleteDeliveryDestinationCommand/
 */
export interface SimDeleteDeliveryDestinationCommand {
  readonly input: SimDeleteDeliveryDestinationCommandInput;
}

export interface SimDeleteDeliveryDestinationCommandInput {
  readonly name?: string | undefined;
}

export interface SimDeleteDeliveryDestinationCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
