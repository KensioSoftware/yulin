import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimDeleteAlarmsCommand,
  SimDescribeAlarmHistoryCommand,
  SimDescribeAlarmsCommand,
  SimPutMetricAlarmCommand,
  SimSetAlarmStateCommand,
} from "../command/alarm/alarm.command.js";
import type { SimPutMetricDataCommand } from "../command/data/data.command.js";
import type {
  SimGetMetricDataCommand,
  SimGetMetricStatisticsCommand,
  SimListMetricsCommand,
} from "../command/query/query.command.js";
import type { SimCloudWatch } from "../sim-cloudwatch.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated CloudWatch.
 */
export class SimCloudWatchSdkCommandRouter implements SimSdkCommandRouter {
  readonly #routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simCloudWatch: SimCloudWatch) {
    this.#routes = new Map<string, SimSdkCommandRoute>([
      [
        "PutMetricDataCommand",
        async (command, context): Promise<unknown> =>
          await simCloudWatch.putMetricData(
            command as SimPutMetricDataCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListMetricsCommand",
        async (command, context): Promise<unknown> =>
          await simCloudWatch.listMetrics(
            command as SimListMetricsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetMetricStatisticsCommand",
        async (command, context): Promise<unknown> =>
          await simCloudWatch.getMetricStatistics(
            command as SimGetMetricStatisticsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetMetricDataCommand",
        async (command, context): Promise<unknown> =>
          await simCloudWatch.getMetricData(
            command as SimGetMetricDataCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutMetricAlarmCommand",
        async (command, context): Promise<unknown> =>
          await simCloudWatch.putMetricAlarm(
            command as SimPutMetricAlarmCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeAlarmsCommand",
        async (command, context): Promise<unknown> =>
          await simCloudWatch.describeAlarms(
            command as SimDescribeAlarmsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteAlarmsCommand",
        async (command, context): Promise<unknown> =>
          await simCloudWatch.deleteAlarms(
            command as SimDeleteAlarmsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "SetAlarmStateCommand",
        async (command, context): Promise<unknown> =>
          await simCloudWatch.setAlarmState(
            command as SimSetAlarmStateCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeAlarmHistoryCommand",
        async (command, context): Promise<unknown> =>
          await simCloudWatch.describeAlarmHistory(
            command as SimDescribeAlarmHistoryCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated CloudWatch can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.#routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated CloudWatch supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.#routes.get(commandName);
  }
}
