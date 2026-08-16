import { SimCloudWatchInvalidParameterValueException } from "../../error/sim-cloudwatch.error.js";
import type { SimPutMetricAlarmCommandInput } from "./alarm.command.js";

/**
 * How many actions real CloudWatch allows in one of an alarm's three lists.
 */
const maximumActions = 5;

/**
 * The only action target this simulation carries out.
 */
const snsArnPrefix = "arn:aws:sns:";

/**
 * Read one of an alarm's action lists.
 *
 * An action that is not an SNS topic is refused rather than stored and
 * ignored. Real CloudWatch would scale a group or stop an instance, and an
 * alarm here that quietly did nothing instead would let a test assert its
 * alarm fired while the thing the alarm exists to do never happened.
 */
export function simCloudWatchAlarmActions(
  field: string,
  actions?: readonly string[],
): readonly string[] {
  if (actions === undefined) {
    return [];
  }

  if (actions.length > maximumActions) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter ${field} may hold at most ${maximumActions} actions, ` +
        `and ${actions.length} were given.`,
    );
  }

  for (const action of actions) {
    if (!action.startsWith(snsArnPrefix)) {
      throw new SimCloudWatchInvalidParameterValueException(
        `The action ${action} in ${field} is not simulated: an alarm here ` +
          `notifies an SNS topic, and nothing else. Auto Scaling, EC2, ` +
          `Systems Manager and Lambda actions are out of scope.`,
      );
    }
  }

  return actions;
}

/**
 * Refuse the alarm inputs real CloudWatch accepts and this does not carry out.
 *
 * Every one of them changes what the alarm watches or how it decides, so an
 * alarm that took one and ignored it would sit in a test looking configured
 * and evaluating something else.
 */
export function refuseUnsimulatedSimCloudWatchAlarmInput(
  input: SimPutMetricAlarmCommandInput,
): void {
  refuse(
    "Metrics",
    input.Metrics,
    "metric math and multi-metric alarms are not simulated",
  );
  refuse(
    "ThresholdMetricId",
    input.ThresholdMetricId,
    "anomaly detection alarms need a trained model, which there is none of here",
  );
  refuse(
    "ExtendedStatistic",
    input.ExtendedStatistic,
    "percentiles need the individual values behind a period, which a " +
      "StatisticValues datum never carries",
  );
  refuse(
    "EvaluateLowSampleCountPercentile",
    input.EvaluateLowSampleCountPercentile,
    "it only applies to percentile alarms, which are not simulated",
  );
  refuse("Tags", input.Tags, "alarm tags are not simulated");
}

function refuse(field: string, value: unknown, because: string): void {
  if (value === undefined) {
    return;
  }

  throw new SimCloudWatchInvalidParameterValueException(
    `The parameter ${field} is not simulated: ${because}.`,
  );
}
