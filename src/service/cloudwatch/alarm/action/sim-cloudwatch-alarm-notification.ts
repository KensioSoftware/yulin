import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCloudWatchAlarm } from "../sim-cloudwatch-alarm.js";
import type { SimCloudWatchAlarmTransition } from "../sim-cloudwatch-alarm.js";

interface SimCloudWatchAlarmMessageProperties {
  readonly alarm: SimCloudWatchAlarm;
  readonly transition: SimCloudWatchAlarmTransition;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The subject line real CloudWatch puts on an alarm notification.
 */
export function simCloudWatchAlarmSubject(
  properties: SimCloudWatchAlarmMessageProperties,
): string {
  const { transition, accountRegionScope } = properties;
  const name = properties.alarm.name;

  return `${transition.state}: "${name}" in ${accountRegionScope.regionName}`;
}

/**
 * The JSON body real CloudWatch publishes when an alarm changes state.
 *
 * The shape is what a subscriber parses, so it is worth matching: a Lambda
 * function reading `NewStateValue` out of an SNS message is the code a test
 * here is most likely to be exercising.
 *
 * `Region` carries the region code rather than the human name real CloudWatch
 * uses ("eu-west-2" rather than "EU (London)"), because the simulation knows
 * the code and nothing here maps one to the other.
 */
export function simCloudWatchAlarmMessage(
  properties: SimCloudWatchAlarmMessageProperties,
): string {
  const { alarm, transition, accountRegionScope } = properties;
  const definition = alarm.definition;

  return JSON.stringify({
    AlarmName: alarm.name,
    AlarmDescription: definition.alarmDescription ?? null,
    AWSAccountId: accountRegionScope.accountId,
    AlarmConfigurationUpdatedTimestamp:
      alarm.configurationUpdatedAt.toISOString(),
    NewStateValue: transition.state,
    NewStateReason: transition.reason,
    StateChangeTime: transition.at.toISOString(),
    Region: accountRegionScope.regionName,
    AlarmArn: alarm.arn,
    OldStateValue: transition.previousState,
    OKActions: definition.okActions,
    AlarmActions: definition.alarmActions,
    InsufficientDataActions: definition.insufficientDataActions,
    Trigger: {
      MetricName: definition.metric.metricName,
      Namespace: definition.metric.namespace,
      StatisticType: "Statistic",
      Statistic: definition.statistic.toUpperCase(),
      Unit: definition.unit ?? null,
      Dimensions: definition.metric.dimensions.map((dimension) => ({
        value: dimension.value,
        name: dimension.name,
      })),
      Period: definition.period,
      EvaluationPeriods: definition.evaluationPeriods,
      DatapointsToAlarm: definition.datapointsToAlarm,
      ComparisonOperator: definition.comparisonOperator,
      Threshold: definition.threshold,
      TreatMissingData: definition.treatMissingData,
    },
  });
}
