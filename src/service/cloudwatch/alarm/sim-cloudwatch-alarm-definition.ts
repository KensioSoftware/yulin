import type { SimCloudWatchMetricIdentity } from "../metric/sim-cloudwatch-metric.js";
import type { SimCloudWatchStatistic } from "../metric/sim-cloudwatch-statistic.js";
import type { SimCloudWatchUnit } from "../metric/sim-cloudwatch-unit.js";
import type { SimCloudWatchComparisonOperator } from "./sim-cloudwatch-comparison.js";
import type { SimCloudWatchMissingDataTreatment } from "./sim-cloudwatch-missing-data.js";

/**
 * What one alarm watches for, as PutMetricAlarm stated it.
 *
 * Held apart from the alarm itself because it is replaced wholesale: real
 * PutMetricAlarm on a name that exists updates every one of these rather than
 * merging, and the alarm keeps its state and history across the change.
 */
export interface SimCloudWatchAlarmDefinition {
  readonly alarmName: string;
  readonly alarmDescription: string | undefined;

  readonly metric: SimCloudWatchMetricIdentity;
  readonly statistic: SimCloudWatchStatistic;
  readonly unit: SimCloudWatchUnit | undefined;

  /** How long each evaluated period is, in seconds. */
  readonly period: number;

  /** How many periods back the alarm looks each time it evaluates. */
  readonly evaluationPeriods: number;

  /** How many of those must breach for the alarm to fire. */
  readonly datapointsToAlarm: number;

  readonly threshold: number;
  readonly comparisonOperator: SimCloudWatchComparisonOperator;
  readonly treatMissingData: SimCloudWatchMissingDataTreatment;

  readonly actionsEnabled: boolean;
  readonly alarmActions: readonly string[];
  readonly okActions: readonly string[];
  readonly insufficientDataActions: readonly string[];
}
