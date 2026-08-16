import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim CloudWatch Logs PutLogEvents command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/PutLogEventsCommand/
 */
export interface SimPutLogEventsCommand {
  readonly input: SimPutLogEventsCommandInput;
}

export interface SimPutLogEventsCommandInput {
  readonly logGroupName?: string | undefined;
  readonly logStreamName?: string | undefined;
  readonly logEvents?: readonly SimLogsInputLogEvent[] | undefined;

  /**
   * Real CloudWatch Logs stopped requiring this in 2023 and ignores whatever
   * is sent, so this takes it and ignores it too.
   */
  readonly sequenceToken?: string | undefined;
}

export interface SimLogsInputLogEvent {
  readonly timestamp?: number | undefined;
  readonly message?: string | undefined;
}

export interface SimPutLogEventsCommandOutput {
  readonly nextSequenceToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch Logs GetLogEvents command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/GetLogEventsCommand/
 */
export interface SimGetLogEventsCommand {
  readonly input: SimGetLogEventsCommandInput;
}

export interface SimGetLogEventsCommandInput {
  readonly logGroupName?: string | undefined;
  readonly logStreamName?: string | undefined;
  readonly startTime?: number | undefined;
  readonly endTime?: number | undefined;
  readonly limit?: number | undefined;
  readonly startFromHead?: boolean | undefined;
  readonly nextToken?: string | undefined;
}

export interface SimGetLogEventsCommandOutput {
  readonly events?: readonly SimLogsOutputLogEvent[] | undefined;
  readonly nextForwardToken?: string | undefined;
  readonly nextBackwardToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

export interface SimLogsOutputLogEvent {
  readonly timestamp: number;
  readonly ingestionTime: number;
  readonly message: string;
}

/**
 * Minimal structural sim CloudWatch Logs FilterLogEvents command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/FilterLogEventsCommand/
 */
export interface SimFilterLogEventsCommand {
  readonly input: SimFilterLogEventsCommandInput;
}

export interface SimFilterLogEventsCommandInput {
  readonly logGroupName?: string | undefined;
  readonly logStreamNames?: readonly string[] | undefined;
  readonly logStreamNamePrefix?: string | undefined;
  readonly filterPattern?: string | undefined;
  readonly startTime?: number | undefined;
  readonly endTime?: number | undefined;
  readonly limit?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface SimFilterLogEventsCommandOutput {
  readonly events?: readonly SimLogsFilteredLogEvent[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

export interface SimLogsFilteredLogEvent {
  readonly logStreamName: string;
  readonly timestamp: number;
  readonly ingestionTime: number;
  readonly message: string;
  readonly eventId: string;
}
