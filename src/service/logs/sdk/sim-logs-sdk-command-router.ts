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
import type {
  SimDeleteDeliveryDestinationCommand,
  SimDescribeDeliveryDestinationsCommand,
  SimPutDeliveryDestinationCommand,
} from "../command/delivery/delivery-destination.command.js";
import type {
  SimDeleteDeliverySourceCommand,
  SimDescribeDeliverySourcesCommand,
  SimPutDeliverySourceCommand,
} from "../command/delivery/delivery-source.command.js";
import type {
  SimCreateDeliveryCommand,
  SimDeleteDeliveryCommand,
  SimDescribeDeliveriesCommand,
} from "../command/delivery/delivery.command.js";
import type {
  SimDeleteMetricFilterCommand,
  SimDescribeMetricFiltersCommand,
  SimPutMetricFilterCommand,
} from "../command/metric/metric-filter.command.js";
import type {
  SimDeleteSubscriptionFilterCommand,
  SimDescribeSubscriptionFiltersCommand,
  SimPutSubscriptionFilterCommand,
} from "../command/subscription/subscription.command.js";
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
        "PutSubscriptionFilterCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.putSubscriptionFilter(
            command as SimPutSubscriptionFilterCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeSubscriptionFiltersCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.describeSubscriptionFilters(
            command as SimDescribeSubscriptionFiltersCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteSubscriptionFilterCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.deleteSubscriptionFilter(
            command as SimDeleteSubscriptionFilterCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutMetricFilterCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.putMetricFilter(
            command as SimPutMetricFilterCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeMetricFiltersCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.describeMetricFilters(
            command as SimDescribeMetricFiltersCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteMetricFilterCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.deleteMetricFilter(
            command as SimDeleteMetricFilterCommand,
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
      [
        "PutDeliverySourceCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.putDeliverySource(
            command as SimPutDeliverySourceCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeDeliverySourcesCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.describeDeliverySources(
            command as SimDescribeDeliverySourcesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteDeliverySourceCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.deleteDeliverySource(
            command as SimDeleteDeliverySourceCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutDeliveryDestinationCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.putDeliveryDestination(
            command as SimPutDeliveryDestinationCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeDeliveryDestinationsCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.describeDeliveryDestinations(
            command as SimDescribeDeliveryDestinationsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteDeliveryDestinationCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.deleteDeliveryDestination(
            command as SimDeleteDeliveryDestinationCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateDeliveryCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.createDelivery(
            command as SimCreateDeliveryCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeDeliveriesCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.describeDeliveries(
            command as SimDescribeDeliveriesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteDeliveryCommand",
        async (command, context): Promise<unknown> =>
          await simLogs.deleteDelivery(
            command as SimDeleteDeliveryCommand,
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
