import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimFilterLogEventsCommand,
  SimGetLogEventsCommand,
  SimPutLogEventsCommand,
} from "../command/event/event.command.js";
import type {
  SimCreateLogGroupCommand,
  SimDeleteLogGroupCommand,
  SimDeleteRetentionPolicyCommand,
  SimDescribeLogGroupsCommand,
  SimPutRetentionPolicyCommand,
} from "../command/group/group.command.js";
import type {
  SimCreateLogStreamCommand,
  SimDescribeLogStreamsCommand,
} from "../command/stream/stream.command.js";
import type { SimLogs } from "../sim-logs.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated CloudWatch Logs.
 */
export class SimLogsSdkCommandRouter implements SimSdkCommandRouter {
  readonly #routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simLogs: SimLogs) {
    this.#routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateLogGroupCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.createLogGroup(
            command as SimCreateLogGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteLogGroupCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.deleteLogGroup(
            command as SimDeleteLogGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeLogGroupsCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.describeLogGroups(
            command as SimDescribeLogGroupsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutRetentionPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.putRetentionPolicy(
            command as SimPutRetentionPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteRetentionPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.deleteRetentionPolicy(
            command as SimDeleteRetentionPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateLogStreamCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.createLogStream(
            command as SimCreateLogStreamCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeLogStreamsCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.describeLogStreams(
            command as SimDescribeLogStreamsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutLogEventsCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.putLogEvents(
            command as SimPutLogEventsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetLogEventsCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.getLogEvents(
            command as SimGetLogEventsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "FilterLogEventsCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.filterLogEvents(
            command as SimFilterLogEventsCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated CloudWatch Logs can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.#routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated CloudWatch Logs
   * supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.#routes.get(commandName);
  }
}
