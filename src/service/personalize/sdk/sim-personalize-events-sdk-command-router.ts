import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimPutEventsCommand,
  SimPutItemsCommand,
  SimPutUsersCommand,
} from "../command/events/events.command.js";
import type { SimPersonalizeEvents } from "../sim-personalize-events.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Personalize Events.
 *
 * The events commands have a router of their own because they arrive on a
 * client of their own. An intercepted `PersonalizeEventsClient` reports the
 * `Personalize Events` service id, which is neither the `PersonalizeClient`
 * one nor the `PersonalizeRuntimeClient` one.
 */
export class SimPersonalizeEventsSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simPersonalizeEvents: SimPersonalizeEvents) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "PutEventsCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalizeEvents.putEvents(
            command as SimPutEventsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutItemsCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalizeEvents.putItems(
            command as SimPutItemsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutUsersCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalizeEvents.putUsers(
            command as SimPutUsersCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Personalize Events can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Personalize Events
   * supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
