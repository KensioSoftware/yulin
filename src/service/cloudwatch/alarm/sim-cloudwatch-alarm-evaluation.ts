import type { SimCloudWatchAlarmDefinition } from "./sim-cloudwatch-alarm-definition.js";
import type { SimCloudWatchAlarmState } from "./sim-cloudwatch-alarm-state.js";
import { simCloudWatchBreaches } from "./sim-cloudwatch-comparison.js";

/**
 * What one evaluated period was worth to the alarm.
 *
 * A period is missing when nothing was published into it, which is a different
 * thing from a period whose values happened to sum to zero.
 */
export type SimCloudWatchPeriodVerdict =
  | "breaching"
  | "notBreaching"
  | "absent";

/**
 * What an evaluation decided, and why.
 *
 * `state` being undefined means the alarm keeps the state it has, which is
 * what `TreatMissingData: ignore` asks for.
 */
export interface SimCloudWatchEvaluation {
  readonly state: SimCloudWatchAlarmState | undefined;
  readonly reason: string;
}

/**
 * Decide what the periods an alarm just looked at make its state.
 *
 * The periods arrive oldest first and are as many as `evaluationPeriods`, with
 * `undefined` for a period nothing was published into.
 *
 * This is CloudWatch's M-of-N rule: the alarm fires when at least
 * `datapointsToAlarm` of the periods breach, whether or not they are
 * consecutive. Everything else is OK, except that an alarm with nothing to go
 * on reports INSUFFICIENT_DATA rather than guessing.
 */
export function evaluateSimCloudWatchAlarm(
  values: readonly (number | undefined)[],
  definition: SimCloudWatchAlarmDefinition,
): SimCloudWatchEvaluation {
  const verdicts = values.map((value) => verdictFor(value, definition));

  if (keepsItsState(verdicts, definition)) {
    return {
      state: undefined,
      reason:
        "Insufficient Data: the alarm is configured to ignore missing data, " +
        "so its state is unchanged",
    };
  }

  const breaching = verdicts.filter(
    (verdict) => verdict === "breaching",
  ).length;

  if (breaching >= definition.datapointsToAlarm) {
    return { state: "ALARM", reason: reason(breaching, definition, "") };
  }

  if (verdicts.every((verdict) => verdict === "absent")) {
    return {
      state: "INSUFFICIENT_DATA",
      reason: `Insufficient Data: ${String(values.length)} datapoints were unknown`,
    };
  }

  return { state: "OK", reason: reason(breaching, definition, "only ") };
}

/**
 * Whether the alarm was told to leave its state alone when data is missing.
 */
function keepsItsState(
  verdicts: readonly SimCloudWatchPeriodVerdict[],
  definition: SimCloudWatchAlarmDefinition,
): boolean {
  return (
    definition.treatMissingData === "ignore" && verdicts.includes("absent")
  );
}

/**
 * What one period is worth, once missing data has been treated.
 *
 * `missing` leaves an absent period absent, so it counts towards neither side
 * and only matters if every period is absent. The other two treatments turn it
 * into a period with an opinion.
 */
function verdictFor(
  value: number | undefined,
  definition: SimCloudWatchAlarmDefinition,
): SimCloudWatchPeriodVerdict {
  if (value !== undefined) {
    return simCloudWatchBreaches(
      value,
      definition.threshold,
      definition.comparisonOperator,
    )
      ? "breaching"
      : "notBreaching";
  }

  switch (definition.treatMissingData) {
    case "breaching": {
      return "breaching";
    }
    case "notBreaching": {
      return "notBreaching";
    }
    // `missing` leaves the period absent so it counts towards neither side,
    // and `ignore` never reaches here: an absent period under it stops the
    // evaluation before any verdict is read.
    case "missing":
    case "ignore": {
      return "absent";
    }
  }
}

/**
 * Why the alarm decided what it did, in the shape real CloudWatch words it.
 */
function reason(
  breaching: number,
  definition: SimCloudWatchAlarmDefinition,
  qualifier: string,
): string {
  return `Threshold Crossed: ${qualifier}${String(breaching)} out of the last ${String(definition.evaluationPeriods)} datapoints were ${definition.comparisonOperator} the threshold (${String(definition.threshold)})`;
}
