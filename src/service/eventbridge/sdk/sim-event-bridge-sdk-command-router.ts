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
import type {
  SimDeleteRuleCommand,
  SimDescribeRuleCommand,
  SimDisableRuleCommand,
  SimEnableRuleCommand,
  SimListRulesCommand,
  SimPutRuleCommand,
  SimTestEventPatternCommand,
} from "../command/rule/rule.command.js";
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
      [
        "PutRuleCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.putRule(
            command as SimPutRuleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteRuleCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.deleteRule(
            command as SimDeleteRuleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeRuleCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.describeRule(
            command as SimDescribeRuleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListRulesCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.listRules(
            command as SimListRulesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "EnableRuleCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.enableRule(
            command as SimEnableRuleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DisableRuleCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.disableRule(
            command as SimDisableRuleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "TestEventPatternCommand",
        async (command, context): Promise<unknown> =>
          await simEventBridge.testEventPattern(
            command as SimTestEventPatternCommand,
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
