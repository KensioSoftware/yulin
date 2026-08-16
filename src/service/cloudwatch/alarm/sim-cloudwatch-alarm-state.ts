/**
 * The three states a CloudWatch alarm can be in.
 *
 * `INSUFFICIENT_DATA` is a state rather than an absence of one: an alarm sits
 * in it until enough periods have been evaluated to say, and it can fall back
 * into it later if the metric stops being published.
 */
export const simCloudWatchAlarmStates = [
  "OK",
  "ALARM",
  "INSUFFICIENT_DATA",
] as const;

export type SimCloudWatchAlarmState = (typeof simCloudWatchAlarmStates)[number];

/**
 * Which of an alarm's three action lists a state fires.
 */
export type SimCloudWatchAlarmActionsField =
  | "alarmActions"
  | "okActions"
  | "insufficientDataActions";

/**
 * The actions a state change into each state fires.
 */
export function simCloudWatchActionsFieldFor(
  state: SimCloudWatchAlarmState,
): SimCloudWatchAlarmActionsField {
  switch (state) {
    case "ALARM": {
      return "alarmActions";
    }
    case "OK": {
      return "okActions";
    }
    case "INSUFFICIENT_DATA": {
      return "insufficientDataActions";
    }
  }
}
