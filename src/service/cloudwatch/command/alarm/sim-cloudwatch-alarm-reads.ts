import type { SimCloudWatchAlarm } from "../../alarm/sim-cloudwatch-alarm.js";
import { SimCloudWatchPage } from "../sim-cloudwatch-page.js";
import type { SimCloudWatchRequestOptions } from "../sim-cloudwatch-request-options.js";
import type {
  SimDescribeAlarmHistoryCommand,
  SimDescribeAlarmHistoryCommandOutput,
  SimDescribeAlarmsCommand,
  SimDescribeAlarmsCommandOutput,
} from "./alarm.command.js";
import type { SimCloudWatchAlarmContext } from "./sim-cloudwatch-alarm-context.js";
import {
  simCloudWatchAlarmHistoryDetail,
  simCloudWatchMetricAlarmDetail,
} from "./sim-cloudwatch-alarm-detail.js";

const describeAlarmsAction = "cloudwatch:DescribeAlarms";
const describeAlarmHistoryAction = "cloudwatch:DescribeAlarmHistory";

/**
 * How many alarms, and how many history items, one page reports.
 */
const alarmsPerPage = 100;

/**
 * The commands that report what alarms exist and what has happened to them.
 *
 * Neither takes a resource-level permission on real CloudWatch, so both
 * authorize against every alarm rather than against each one they report.
 */
export class SimCloudWatchAlarmReads {
  readonly #context: SimCloudWatchAlarmContext;

  constructor(context: SimCloudWatchAlarmContext) {
    this.#context = context;
  }

  /**
   * Describe the alarms a request selects, in the order each was created.
   */
  describeAlarms(
    command: SimDescribeAlarmsCommand,
    options?: SimCloudWatchRequestOptions,
  ): SimDescribeAlarmsCommandOutput {
    const input = command.input;

    this.#context.authorizer.authorize(describeAlarmsAction, options?.caller);

    const page = new SimCloudWatchPage({
      listed: this.#context.alarms.all.filter((alarm) => selects(alarm, input)),
      nextToken: input.NextToken,
      pageSize: input.MaxRecords ?? alarmsPerPage,
    });

    return {
      $metadata: {},
      MetricAlarms: page.items.map((alarm) =>
        simCloudWatchMetricAlarmDetail(alarm),
      ),
      CompositeAlarms: [],
      NextToken: page.nextToken,
    };
  }

  /**
   * Report what has happened to an alarm, newest first.
   *
   * Left without an alarm name, this reports across every alarm in the scope,
   * as real CloudWatch does.
   */
  describeAlarmHistory(
    command: SimDescribeAlarmHistoryCommand,
    options?: SimCloudWatchRequestOptions,
  ): SimDescribeAlarmHistoryCommandOutput {
    const input = command.input;

    this.#context.authorizer.authorize(
      describeAlarmHistoryAction,
      options?.caller,
    );

    const items = this.#context.alarms.all
      .filter(
        (alarm) =>
          input.AlarmName === undefined || alarm.name === input.AlarmName,
      )
      .flatMap((alarm) =>
        alarm.history.all
          .filter((item) => within(item.timestamp, input))
          .map((item) => simCloudWatchAlarmHistoryDetail(alarm.name, item)),
      );
    const page = new SimCloudWatchPage({
      listed: items,
      nextToken: input.NextToken,
      pageSize: input.MaxRecords ?? alarmsPerPage,
    });

    return {
      $metadata: {},
      AlarmHistoryItems: page.items,
      NextToken: page.nextToken,
    };
  }
}

function selects(
  alarm: SimCloudWatchAlarm,
  input: SimDescribeAlarmsCommand["input"],
): boolean {
  return (
    (input.AlarmNames === undefined || input.AlarmNames.includes(alarm.name)) &&
    alarm.name.startsWith(input.AlarmNamePrefix ?? "") &&
    (input.StateValue === undefined || alarm.state === input.StateValue) &&
    (input.ActionPrefix === undefined ||
      alarm.definition.alarmActions.some((action) =>
        action.startsWith(input.ActionPrefix ?? ""),
      ))
  );
}

function within(
  timestamp: Date,
  input: SimDescribeAlarmHistoryCommand["input"],
): boolean {
  return (
    (input.StartDate === undefined || timestamp >= input.StartDate) &&
    (input.EndDate === undefined || timestamp < input.EndDate)
  );
}
