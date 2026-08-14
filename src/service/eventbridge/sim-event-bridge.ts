import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimEventBus } from "./bus/sim-event-bus.js";
import { defaultEventBusName } from "./bus/sim-event-bus-name.js";
import { SimEventBusStore } from "./bus/sim-event-bus-store.js";
import type * as simEventBridgeCommands from "./command/sim-event-bridge-command.types.js";
import { SimEventBridgeCommands } from "./command/sim-event-bridge-commands.js";
import type { SimEventBridgeRequestOptions } from "./command/sim-event-bridge-request-options.js";
import type { SimEventBridgeEvent } from "./event/sim-event-bridge-event.js";
import type { SimEventBusReceipt } from "./bus/sim-event-bus.js";
import type { SimEventRule } from "./rule/sim-event-rule.js";
import { SimEventRuleStore } from "./rule/sim-event-rule-store.js";
import { SimEventBridgeSdkCommandRouter } from "./sdk/sim-event-bridge-sdk-command-router.js";

interface SimEventBridgeProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated EventBridge. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * Event buses are scoped to an account and region, as they are on real AWS: a
 * bus name is unique within one of those scopes, and every scope has a
 * `default` bus without one being created.
 *
 * A bus is a router rather than a store. An event put onto one is matched
 * against that bus's rules and sent to their targets, and an event that
 * matches nothing is gone. Rules and targets are not simulated yet, so every
 * event put onto a bus today is dropped after it arrives.
 */
export class SimEventBridge {
  private readonly buses: SimEventBusStore;
  private readonly rules = new SimEventRuleStore();
  private readonly commands: SimEventBridgeCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimEventBridgeSdkCommandRouter(this);

  constructor(properties: SimEventBridgeProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.background = background;
    this.buses = new SimEventBusStore(
      SimEventBus.default({ accountRegionScope, createdAt: background.now() }),
    );
    this.commands = new SimEventBridgeCommands({
      buses: this.buses,
      rules: this.rules,
      iam,
      background,
      accountRegionScope,
    });
  }

  /**
   * Find an event bus by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting bus
   * state without going through a Command and its authorization.
   */
  findEventBus(name: string): SimEventBus | undefined {
    return this.buses.find(name);
  }

  /**
   * Every event a bus received, in arrival order.
   *
   * This is the simulator's own accessor, for a test asserting on the envelope
   * EventBridge built from a PutEvents entry. Real EventBridge keeps no events
   * and offers nothing like it, so nothing an SDK command returns is built
   * from this. A bus that is not there received nothing.
   */
  eventsOn(busName: string): readonly SimEventBridgeEvent[] {
    return this.buses.find(busName)?.receivedEvents ?? [];
  }

  /**
   * Find a rule by name, on a bus.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting rule
   * state without going through a Command and its authorization.
   */
  findRule(
    ruleName: string,
    busName = defaultEventBusName,
  ): SimEventRule | undefined {
    return this.rules.find(busName, ruleName);
  }

  /**
   * Every event a bus received, with the rules each one matched.
   *
   * This is the simulator's own accessor, for a test asserting on which rules
   * an event reached. Real EventBridge keeps nothing like it, and nothing an
   * SDK command returns is built from it.
   */
  receiptsOn(busName: string): readonly SimEventBusReceipt[] {
    return this.buses.find(busName)?.receipts ?? [];
  }

  /**
   * Handle a CreateEventBus Command from the SDK.
   */
  async createEventBus(
    command: simEventBridgeCommands.SimCreateEventBusCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimCreateEventBusCommandOutput> {
    await this.background.sequence();
    return this.commands.busCreation.handle(command, options);
  }

  /**
   * Handle a DeleteEventBus Command from the SDK.
   */
  async deleteEventBus(
    command: simEventBridgeCommands.SimDeleteEventBusCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimDeleteEventBusCommandOutput> {
    await this.background.sequence();
    return this.commands.busDeletion.handle(command, options);
  }

  /**
   * Handle a DescribeEventBus Command from the SDK.
   */
  async describeEventBus(
    command: simEventBridgeCommands.SimDescribeEventBusCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimDescribeEventBusCommandOutput> {
    await this.background.sequence();
    return this.commands.buses.describeEventBus(command, options);
  }

  /**
   * Handle a ListEventBuses Command from the SDK.
   */
  async listEventBuses(
    command: simEventBridgeCommands.SimListEventBusesCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimListEventBusesCommandOutput> {
    await this.background.sequence();
    return this.commands.buses.listEventBuses(command, options);
  }

  /**
   * Handle a PutEvents Command from the SDK.
   */
  async putEvents(
    command: simEventBridgeCommands.SimPutEventsCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimPutEventsCommandOutput> {
    await this.background.sequence();
    return this.commands.putEvents.handle(command, options);
  }

  /**
   * Handle a PutRule Command from the SDK.
   */
  async putRule(
    command: simEventBridgeCommands.SimPutRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimPutRuleCommandOutput> {
    await this.background.sequence();
    return this.commands.ruleCreation.handle(command, options);
  }

  /**
   * Handle a DeleteRule Command from the SDK.
   */
  async deleteRule(
    command: simEventBridgeCommands.SimDeleteRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimDeleteRuleCommandOutput> {
    await this.background.sequence();
    return this.commands.rules.deleteRule(command, options);
  }

  /**
   * Handle a DescribeRule Command from the SDK.
   */
  async describeRule(
    command: simEventBridgeCommands.SimDescribeRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimDescribeRuleCommandOutput> {
    await this.background.sequence();
    return this.commands.rules.describeRule(command, options);
  }

  /**
   * Handle a ListRules Command from the SDK.
   */
  async listRules(
    command: simEventBridgeCommands.SimListRulesCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimListRulesCommandOutput> {
    await this.background.sequence();
    return this.commands.rules.listRules(command, options);
  }

  /**
   * Handle an EnableRule Command from the SDK.
   */
  async enableRule(
    command: simEventBridgeCommands.SimEnableRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimEnableRuleCommandOutput> {
    await this.background.sequence();
    return this.commands.rules.enableRule(command, options);
  }

  /**
   * Handle a DisableRule Command from the SDK.
   */
  async disableRule(
    command: simEventBridgeCommands.SimDisableRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimDisableRuleCommandOutput> {
    await this.background.sequence();
    return this.commands.rules.disableRule(command, options);
  }

  /**
   * Handle a TestEventPattern Command from the SDK.
   */
  async testEventPattern(
    command: simEventBridgeCommands.SimTestEventPatternCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimTestEventPatternCommandOutput> {
    await this.background.sequence();
    return this.commands.patternTest.handle(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
