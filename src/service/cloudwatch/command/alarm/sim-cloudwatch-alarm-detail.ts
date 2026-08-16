import type { SimCloudWatchAlarm } from "../../alarm/sim-cloudwatch-alarm.js";
import type { SimCloudWatchAlarmHistoryItem } from "../../alarm/sim-cloudwatch-alarm-history.js";
import type {
  SimCloudWatchAlarmHistoryItemDetail,
  SimCloudWatchMetricAlarmDetail,
} from "./alarm.command.js";

/**
 * The one alarm type this simulation has. Composite alarms are out of scope,
 * so every alarm reported is a metric alarm.
 */
const metricAlarmType = "MetricAlarm";

/**
 * What DescribeAlarms reports about one alarm.
 */
export function simCloudWatchMetricAlarmDetail(
  alarm: SimCloudWatchAlarm,
): SimCloudWatchMetricAlarmDetail {
  const definition = alarm.definition;

  return {
    AlarmName: alarm.name,
    AlarmArn: alarm.arn,
    AlarmDescription: definition.alarmDescription,
    AlarmConfigurationUpdatedTimestamp: alarm.configurationUpdatedAt,
    ActionsEnabled: definition.actionsEnabled,
    OKActions: definition.okActions,
    AlarmActions: definition.alarmActions,
    InsufficientDataActions: definition.insufficientDataActions,
    StateValue: alarm.state,
    StateReason: alarm.stateReason,
    StateUpdatedTimestamp: alarm.stateUpdatedAt,
    MetricName: definition.metric.metricName,
    Namespace: definition.metric.namespace,
    Statistic: definition.statistic,
    Dimensions: definition.metric.dimensions.map((dimension) => ({
      Name: dimension.name,
      Value: dimension.value,
    })),
    Period: definition.period,
    Unit: definition.unit,
    EvaluationPeriods: definition.evaluationPeriods,
    DatapointsToAlarm: definition.datapointsToAlarm,
    Threshold: definition.threshold,
    ComparisonOperator: definition.comparisonOperator,
    TreatMissingData: definition.treatMissingData,
  };
}

/**
 * What DescribeAlarmHistory reports about one state change.
 *
 * `HistoryData` is the JSON real CloudWatch puts there, which is what a test
 * reads to find why the alarm moved rather than just that it did.
 */
export function simCloudWatchAlarmHistoryDetail(
  alarmName: string,
  item: SimCloudWatchAlarmHistoryItem,
): SimCloudWatchAlarmHistoryItemDetail {
  return {
    AlarmName: alarmName,
    AlarmType: metricAlarmType,
    Timestamp: item.timestamp,
    HistoryItemType: "StateUpdate",
    HistorySummary: `Alarm updated from ${item.previousState} to ${item.state}`,
    HistoryData: JSON.stringify({
      oldState: { stateValue: item.previousState },
      newState: {
        stateValue: item.state,
        stateReason: item.reason,
      },
    }),
  };
}
