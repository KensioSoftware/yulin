import type { SimCloudWatchAlarm } from "../../alarm/sim-cloudwatch-alarm.js";
import type {
  SimCloudWatchAlarmHistoryItemDetail,
  SimDescribeAlarmHistoryCommand,
  SimDescribeAlarmsCommand,
} from "./alarm.command.js";
import { simCloudWatchAlarmHistoryDetail } from "./sim-cloudwatch-alarm-detail.js";

/**
 * Whether a DescribeAlarms request selects one alarm.
 */
export function selectsSimCloudWatchAlarm(
  alarm: SimCloudWatchAlarm,
  input: SimDescribeAlarmsCommand["input"],
): boolean {
  return (
    (input.AlarmNames === undefined || input.AlarmNames.includes(alarm.name)) &&
    alarm.name.startsWith(input.AlarmNamePrefix ?? "") &&
    (input.StateValue === undefined || alarm.state === input.StateValue) &&
    usesAction(alarm, input.ActionPrefix)
  );
}

/**
 * Whether an alarm carries an action starting with a prefix, in any of its
 * three lists. Real CloudWatch filters on the actions an alarm uses, not on
 * the ones it uses for one state.
 */
function usesAction(
  alarm: SimCloudWatchAlarm,
  actionPrefix: string | undefined,
): boolean {
  if (actionPrefix === undefined) {
    return true;
  }

  const definition = alarm.definition;

  return [
    ...definition.alarmActions,
    ...definition.okActions,
    ...definition.insufficientDataActions,
  ].some((action) => action.startsWith(actionPrefix));
}

/**
 * The history items a DescribeAlarmHistory request selects, in the order it
 * asked for.
 */
export function simCloudWatchAlarmHistory(
  alarms: readonly SimCloudWatchAlarm[],
  input: SimDescribeAlarmHistoryCommand["input"],
): readonly SimCloudWatchAlarmHistoryItemDetail[] {
  const items = alarms
    .filter(
      (alarm) =>
        input.AlarmName === undefined || alarm.name === input.AlarmName,
    )
    .flatMap((alarm) =>
      alarm.history.all
        .filter((item) =>
          withinSimCloudWatchHistoryWindow(item.timestamp, input),
        )
        .map((item) => simCloudWatchAlarmHistoryDetail(alarm.name, item)),
    )
    .filter(
      (item) =>
        input.HistoryItemType === undefined ||
        item.HistoryItemType === input.HistoryItemType,
    );

  return orderedByTime(items, input.ScanBy);
}

/**
 * History newest first, which is how real CloudWatch answers unless a request
 * asks the other way. Items come from each alarm already in order, so an
 * unfiltered read across several alarms has to be merged rather than
 * concatenated.
 */
function orderedByTime(
  items: readonly SimCloudWatchAlarmHistoryItemDetail[],
  scanBy: string | undefined,
): readonly SimCloudWatchAlarmHistoryItemDetail[] {
  const ascending = items.toSorted(
    (left, right) => left.Timestamp.getTime() - right.Timestamp.getTime(),
  );

  return scanBy === "TimestampAscending" ? ascending : ascending.toReversed();
}

/**
 * Whether one history item falls in the window a request asked about, which
 * includes its start and excludes its end as CloudWatch reads a range.
 */
function withinSimCloudWatchHistoryWindow(
  timestamp: Date,
  input: SimDescribeAlarmHistoryCommand["input"],
): boolean {
  return (
    (input.StartDate === undefined || timestamp >= input.StartDate) &&
    (input.EndDate === undefined || timestamp < input.EndDate)
  );
}
