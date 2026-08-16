import type { SimCloudWatchAlarmDefinition } from "../../alarm/sim-cloudwatch-alarm-definition.js";
import { requiredSimCloudWatchComparisonOperator } from "../../alarm/sim-cloudwatch-comparison.js";
import { simCloudWatchMissingDataOrDefault } from "../../alarm/sim-cloudwatch-missing-data.js";
import { requiredSimCloudWatchDimensions } from "../../metric/sim-cloudwatch-dimension.js";
import { requiredSimCloudWatchName } from "../../metric/sim-cloudwatch-name.js";
import { requiredSimCloudWatchNamespace } from "../../metric/sim-cloudwatch-namespace.js";
import { requiredSimCloudWatchPeriod } from "../../metric/sim-cloudwatch-period.js";
import { requiredSimCloudWatchStatistic } from "../../metric/sim-cloudwatch-statistic.js";
import { simCloudWatchUnitOrUndefined } from "../../metric/sim-cloudwatch-unit.js";
import type { SimPutMetricAlarmCommandInput } from "./alarm.command.js";
import {
  refuseUnsimulatedSimCloudWatchAlarmInput,
  simCloudWatchAlarmActions,
} from "./sim-cloudwatch-alarm-action-input.js";
import {
  requiredSimCloudWatchThreshold,
  requiredSimCloudWatchValue,
  requiredSimCloudWatchWholeNumber,
  simCloudWatchDatapointsToAlarm,
} from "./sim-cloudwatch-alarm-numbers.js";

/**
 * Read what an alarm watches for, refusing what real CloudWatch would refuse.
 */
export function readSimCloudWatchAlarmDefinition(
  input: SimPutMetricAlarmCommandInput,
): SimCloudWatchAlarmDefinition {
  refuseUnsimulatedSimCloudWatchAlarmInput(input);

  const evaluationPeriods = requiredSimCloudWatchWholeNumber(
    "EvaluationPeriods",
    input.EvaluationPeriods,
  );

  return {
    alarmName: requiredSimCloudWatchName("AlarmName", input.AlarmName),
    alarmDescription: input.AlarmDescription,
    metric: {
      namespace: requiredSimCloudWatchNamespace(input.Namespace),
      metricName: requiredSimCloudWatchName("MetricName", input.MetricName),
      dimensions: requiredSimCloudWatchDimensions(input.Dimensions),
    },
    statistic: requiredSimCloudWatchStatistic(
      requiredSimCloudWatchValue("Statistic", input.Statistic),
    ),
    unit: simCloudWatchUnitOrUndefined("Unit", input.Unit),
    period: requiredSimCloudWatchPeriod(input.Period),
    evaluationPeriods,
    datapointsToAlarm: simCloudWatchDatapointsToAlarm(
      input.DatapointsToAlarm,
      evaluationPeriods,
    ),
    threshold: requiredSimCloudWatchThreshold(input.Threshold),
    comparisonOperator: requiredSimCloudWatchComparisonOperator(
      input.ComparisonOperator,
    ),
    treatMissingData: simCloudWatchMissingDataOrDefault(input.TreatMissingData),
    actionsEnabled: input.ActionsEnabled ?? true,
    alarmActions: simCloudWatchAlarmActions("AlarmActions", input.AlarmActions),
    okActions: simCloudWatchAlarmActions("OKActions", input.OKActions),
    insufficientDataActions: simCloudWatchAlarmActions(
      "InsufficientDataActions",
      input.InsufficientDataActions,
    ),
  };
}
