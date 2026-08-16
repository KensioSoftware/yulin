import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudWatch Logs PutSubscriptionFilter command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/PutSubscriptionFilterCommand/
 */
export interface SimPutSubscriptionFilterCommand {
  readonly input: SimPutSubscriptionFilterCommandInput;
}

export interface SimPutSubscriptionFilterCommandInput {
  readonly logGroupName?: string | undefined;
  readonly filterName?: string | undefined;
  readonly filterPattern?: string | undefined;
  readonly destinationArn?: string | undefined;
  readonly roleArn?: string | undefined;
  readonly distribution?: string | undefined;
}

export interface SimPutSubscriptionFilterCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DescribeSubscriptionFilters command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DescribeSubscriptionFiltersCommand/
 */
export interface SimDescribeSubscriptionFiltersCommand {
  readonly input: SimDescribeSubscriptionFiltersCommandInput;
}

export interface SimDescribeSubscriptionFiltersCommandInput {
  readonly logGroupName?: string | undefined;
  readonly filterNamePrefix?: string | undefined;
  readonly limit?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface SimDescribeSubscriptionFiltersCommandOutput {
  readonly subscriptionFilters?:
    | readonly SimLogsSubscriptionFilterDetail[]
    | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * What DescribeSubscriptionFilters reports about one filter.
 */
export interface SimLogsSubscriptionFilterDetail {
  readonly filterName: string;
  readonly logGroupName: string;
  readonly filterPattern: string;
  readonly destinationArn: string;
  readonly roleArn?: string | undefined;
  readonly distribution?: string | undefined;
  readonly creationTime: number;
}

/**
 * Minimal structural sim CloudWatch Logs DeleteSubscriptionFilter command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DeleteSubscriptionFilterCommand/
 */
export interface SimDeleteSubscriptionFilterCommand {
  readonly input: SimDeleteSubscriptionFilterCommandInput;
}

export interface SimDeleteSubscriptionFilterCommandInput {
  readonly logGroupName?: string | undefined;
  readonly filterName?: string | undefined;
}

export interface SimDeleteSubscriptionFilterCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
