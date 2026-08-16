import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudWatch Logs CreateLogStream command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/CreateLogStreamCommand/
 */
export interface SimCreateLogStreamCommand {
  readonly input: SimCreateLogStreamCommandInput;
}

export interface SimCreateLogStreamCommandInput {
  readonly logGroupName?: string | undefined;
  readonly logStreamName?: string | undefined;
}

export interface SimCreateLogStreamCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs DescribeLogStreams command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DescribeLogStreamsCommand/
 */
export interface SimDescribeLogStreamsCommand {
  readonly input: SimDescribeLogStreamsCommandInput;
}

export interface SimDescribeLogStreamsCommandInput {
  readonly logGroupName?: string | undefined;
  readonly logStreamNamePrefix?: string | undefined;
  readonly orderBy?: string | undefined;
  readonly descending?: boolean | undefined;
  readonly limit?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface SimDescribeLogStreamsCommandOutput {
  readonly logStreams?: readonly SimLogsLogStreamDetail[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * What DescribeLogStreams reports about one log stream.
 */
export interface SimLogsLogStreamDetail {
  readonly logStreamName: string;
  readonly creationTime: number;
  readonly firstEventTimestamp?: number | undefined;
  readonly lastEventTimestamp?: number | undefined;
  readonly lastIngestionTime?: number | undefined;
  readonly uploadSequenceToken?: string | undefined;
  readonly arn: string;

  /**
   * Real CloudWatch Logs stopped reporting this per stream in 2019 and has
   * answered zero ever since, so this does too. The bytes a group holds are
   * reported by DescribeLogGroups.
   */
  readonly storedBytes: number;
}
