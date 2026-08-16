import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudWatch Logs CreateLogGroup command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/CreateLogGroupCommand/
 */
export interface SimCreateLogGroupCommand {
  readonly input: SimCreateLogGroupCommandInput;
}

export interface SimCreateLogGroupCommandInput {
  readonly logGroupName?: string | undefined;
  readonly kmsKeyId?: string | undefined;
  readonly tags?: Readonly<Record<string, string>> | undefined;
  readonly logGroupClass?: string | undefined;
}

export interface SimCreateLogGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DeleteLogGroup command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DeleteLogGroupCommand/
 */
export interface SimDeleteLogGroupCommand {
  readonly input: SimDeleteLogGroupCommandInput;
}

export interface SimDeleteLogGroupCommandInput {
  readonly logGroupName?: string | undefined;
}

export interface SimDeleteLogGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DescribeLogGroups command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DescribeLogGroupsCommand/
 */
export interface SimDescribeLogGroupsCommand {
  readonly input: SimDescribeLogGroupsCommandInput;
}

export interface SimDescribeLogGroupsCommandInput {
  readonly logGroupNamePrefix?: string | undefined;
  readonly limit?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface SimDescribeLogGroupsCommandOutput {
  readonly logGroups?: readonly SimLogsLogGroupDetail[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * What DescribeLogGroups reports about one log group.
 */
export interface SimLogsLogGroupDetail {
  readonly logGroupName: string;
  readonly creationTime: number;
  readonly retentionInDays?: number | undefined;
  readonly metricFilterCount: number;
  readonly storedBytes: number;

  /** The ARN with the trailing wildcard, as real CloudWatch Logs reports it. */
  readonly arn: string;

  /** The ARN of the group alone, without the trailing wildcard. */
  readonly logGroupArn: string;
}

/**
 * Minimal structural sim CloudWatch Logs PutRetentionPolicy command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/PutRetentionPolicyCommand/
 */
export interface SimPutRetentionPolicyCommand {
  readonly input: SimPutRetentionPolicyCommandInput;
}

export interface SimPutRetentionPolicyCommandInput {
  readonly logGroupName?: string | undefined;
  readonly retentionInDays?: number | undefined;
}

export interface SimPutRetentionPolicyCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DeleteRetentionPolicy command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DeleteRetentionPolicyCommand/
 */
export interface SimDeleteRetentionPolicyCommand {
  readonly input: SimDeleteRetentionPolicyCommandInput;
}

export interface SimDeleteRetentionPolicyCommandInput {
  readonly logGroupName?: string | undefined;
}

export interface SimDeleteRetentionPolicyCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
