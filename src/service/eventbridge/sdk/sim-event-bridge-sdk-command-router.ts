import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateEventBusCommand,
  SimDeleteEventBusCommand,
  SimDescribeEventBusCommand,
  SimListEventBusesCommand,
} from "../command/bus/bus.command.js";
import type { SimPutEventsCommand } from "../command/put-events/put-events.command.js";
import type { SimEventBridge } from "../sim-event-bridge.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated EventBridge.
 */
export class SimEventBridgeSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simEventBridge: SimEventBridge) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateEventBusCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.createEventBus(
            command as SimCreateEventBusCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteEventBusCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.deleteEventBus(
            command as SimDeleteEventBusCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeEventBusCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.describeEventBus(
            command as SimDescribeEventBusCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListEventBusesCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.listEventBuses(
            command as SimListEventBusesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutEventsCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.putEvents(
            command as SimPutEventsCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated EventBridge can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated EventBridge supports
   * it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
