import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * One metric transformation as the API takes and reports it.
 *
 * `dimensions` is a map of dimension name to value, which is the shape the SDK
 * uses. The CloudFormation Resource carries the same thing as a list of
 * Key/Value pairs.
 */
export interface SimLogsMetricTransformationInput {
  readonly metricName?: string | undefined;
  readonly metricNamespace?: string | undefined;
  readonly metricValue?: string | undefined;
  readonly defaultValue?: number | undefined;
  readonly dimensions?: Readonly<Record<string, string>> | undefined;
  readonly unit?: string | undefined;
}

/**
 * Minimal structural sim CloudWatch Logs PutMetricFilter command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/PutMetricFilterCommand/
 */
export interface SimPutMetricFilterCommand {
  readonly input: SimPutMetricFilterCommandInput;
}

export interface SimPutMetricFilterCommandInput {
  readonly logGroupName?: string | undefined;
  readonly filterName?: string | undefined;
  readonly filterPattern?: string | undefined;
  readonly metricTransformations?:
    | readonly SimLogsMetricTransformationInput[]
    | undefined;
}

export interface SimPutMetricFilterCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DescribeMetricFilters command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DescribeMetricFiltersCommand/
 */
export interface SimDescribeMetricFiltersCommand {
  readonly input: SimDescribeMetricFiltersCommandInput;
}

export interface SimDescribeMetricFiltersCommandInput {
  readonly logGroupName?: string | undefined;
  readonly filterNamePrefix?: string | undefined;
  readonly metricName?: string | undefined;
  readonly metricNamespace?: string | undefined;
  readonly limit?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface SimDescribeMetricFiltersCommandOutput {
  readonly metricFilters?: readonly SimLogsMetricFilterDetail[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * What DescribeMetricFilters reports about one filter.
 */
export interface SimLogsMetricFilterDetail {
  readonly filterName: string;
  readonly logGroupName: string;
  readonly filterPattern: string;
  readonly metricTransformations: readonly SimLogsMetricTransformationInput[];
  readonly creationTime: number;
}

/**
 * Minimal structural sim CloudWatch Logs DeleteMetricFilter command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DeleteMetricFilterCommand/
 */
export interface SimDeleteMetricFilterCommand {
  readonly input: SimDeleteMetricFilterCommandInput;
}

export interface SimDeleteMetricFilterCommandInput {
  readonly logGroupName?: string | undefined;
  readonly filterName?: string | undefined;
}

export interface SimDeleteMetricFilterCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
