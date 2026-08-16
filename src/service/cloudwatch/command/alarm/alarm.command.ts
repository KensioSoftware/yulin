import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCloudWatchDimensionInput } from "../../metric/sim-cloudwatch-dimension.js";

/**
 * Minimal structural sim CloudWatch PutMetricAlarm command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/command/PutMetricAlarmCommand/
 */
export interface SimPutMetricAlarmCommand {
  readonly input: SimPutMetricAlarmCommandInput;
}

export interface SimPutMetricAlarmCommandInput {
  readonly AlarmName?: string | undefined;
  readonly AlarmDescription?: string | undefined;
  readonly ActionsEnabled?: boolean | undefined;
  readonly OKActions?: readonly string[] | undefined;
  readonly AlarmActions?: readonly string[] | undefined;
  readonly InsufficientDataActions?: readonly string[] | undefined;
  readonly MetricName?: string | undefined;
  readonly Namespace?: string | undefined;
  readonly Statistic?: string | undefined;
  readonly ExtendedStatistic?: string | undefined;
  readonly Dimensions?: readonly SimCloudWatchDimensionInput[] | undefined;
  readonly Period?: number | undefined;
  readonly Unit?: string | undefined;
  readonly EvaluationPeriods?: number | undefined;
  readonly DatapointsToAlarm?: number | undefined;
  readonly Threshold?: number | undefined;
  readonly ComparisonOperator?: string | undefined;
  readonly TreatMissingData?: string | undefined;
  readonly Metrics?: readonly unknown[] | undefined;
  readonly ThresholdMetricId?: string | undefined;
  readonly EvaluateLowSampleCountPercentile?: string | undefined;
  readonly Tags?: readonly unknown[] | undefined;
}

export interface SimPutMetricAlarmCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch DescribeAlarms command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/command/DescribeAlarmsCommand/
 */
export interface SimDescribeAlarmsCommand {
  readonly input: SimDescribeAlarmsCommandInput;
}

export interface SimDescribeAlarmsCommandInput {
  readonly AlarmNames?: readonly string[] | undefined;
  readonly AlarmNamePrefix?: string | undefined;
  readonly StateValue?: string | undefined;
  readonly ActionPrefix?: string | undefined;
  readonly MaxRecords?: number | undefined;
  readonly NextToken?: string | undefined;
  readonly AlarmTypes?: readonly string[] | undefined;
  readonly ChildrenOfAlarmName?: string | undefined;
  readonly ParentsOfAlarmName?: string | undefined;
}

/**
 * What DescribeAlarms reports about one alarm.
 */
export interface SimCloudWatchMetricAlarmDetail {
  readonly AlarmName: string;
  readonly AlarmArn: string;
  readonly AlarmDescription?: string | undefined;
  readonly AlarmConfigurationUpdatedTimestamp: Date;
  readonly ActionsEnabled: boolean;
  readonly OKActions: readonly string[];
  readonly AlarmActions: readonly string[];
  readonly InsufficientDataActions: readonly string[];
  readonly StateValue: string;
  readonly StateReason: string;
  readonly StateUpdatedTimestamp: Date;
  readonly MetricName: string;
  readonly Namespace: string;
  readonly Statistic: string;
  readonly Dimensions: readonly SimCloudWatchDimensionInput[];
  readonly Period: number;
  readonly Unit?: string | undefined;
  readonly EvaluationPeriods: number;
  readonly DatapointsToAlarm: number;
  readonly Threshold: number;
  readonly ComparisonOperator: string;
  readonly TreatMissingData: string;
}

export interface SimDescribeAlarmsCommandOutput {
  readonly MetricAlarms?: readonly SimCloudWatchMetricAlarmDetail[] | undefined;
  readonly CompositeAlarms?: readonly never[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch DeleteAlarms command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/command/DeleteAlarmsCommand/
 */
export interface SimDeleteAlarmsCommand {
  readonly input: SimDeleteAlarmsCommandInput;
}

export interface SimDeleteAlarmsCommandInput {
  readonly AlarmNames?: readonly string[] | undefined;
}

export interface SimDeleteAlarmsCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch SetAlarmState command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/command/SetAlarmStateCommand/
 */
export interface SimSetAlarmStateCommand {
  readonly input: SimSetAlarmStateCommandInput;
}

export interface SimSetAlarmStateCommandInput {
  readonly AlarmName?: string | undefined;
  readonly StateValue?: string | undefined;
  readonly StateReason?: string | undefined;
  readonly StateReasonData?: string | undefined;
}

export interface SimSetAlarmStateCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudWatch DescribeAlarmHistory command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/command/DescribeAlarmHistoryCommand/
 */
export interface SimDescribeAlarmHistoryCommand {
  readonly input: SimDescribeAlarmHistoryCommandInput;
}

export interface SimDescribeAlarmHistoryCommandInput {
  readonly AlarmName?: string | undefined;
  readonly HistoryItemType?: string | undefined;
  readonly StartDate?: Date | undefined;
  readonly EndDate?: Date | undefined;
  readonly MaxRecords?: number | undefined;
  readonly NextToken?: string | undefined;
  readonly ScanBy?: string | undefined;
  readonly AlarmTypes?: readonly string[] | undefined;
}

/**
 * What DescribeAlarmHistory reports about one thing that happened.
 */
export interface SimCloudWatchAlarmHistoryItemDetail {
  readonly AlarmName: string;
  readonly AlarmType: string;
  readonly Timestamp: Date;
  readonly HistoryItemType: string;
  readonly HistorySummary: string;
  readonly HistoryData: string;
}

export interface SimDescribeAlarmHistoryCommandOutput {
  readonly AlarmHistoryItems?:
    | readonly SimCloudWatchAlarmHistoryItemDetail[]
    | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
