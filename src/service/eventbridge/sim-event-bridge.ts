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
import { SimEventBusStore } from "./bus/sim-event-bus-store.js";
import type * as simEventBridgeCommands from "./command/sim-event-bridge-command.types.js";
import { SimEventBridgeCommands } from "./command/sim-event-bridge-commands.js";
import type { SimEventBridgeRequestOptions } from "./command/sim-event-bridge-request-options.js";
import { SimEventRuleStore } from "./rule/sim-event-rule-store.js";
import { SimEventTargetStore } from "./target/sim-event-target-store.js";
import type { SimEventBridgeDeliveryTargets } from "./delivery/sim-event-bridge-delivery.js";
import type { SimEventBridgeDeliveryFailure } from "./delivery/sim-event-bridge-delivery-failures.js";
import { SimEventBridgeSdkCommandRouter } from "./sdk/sim-event-bridge-sdk-command-router.js";
import { SimEventBridgeInspection } from "./sim-event-bridge-inspection.js";

interface SimEventBridgeProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;

  /**
   * Where this scope's rules deliver to.
   *
   * A SimEventBridge built on its own has none, since a queue, topic or
   * function in another simulated service is only reachable through SimAws.
   */
  readonly deliveryTargets?: SimEventBridgeDeliveryTargets;
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
export class SimEventBridge extends SimEventBridgeInspection {
  protected readonly buses: SimEventBusStore;
  protected readonly rules = new SimEventRuleStore();
  protected readonly targets = new SimEventTargetStore();
  private readonly commands: SimEventBridgeCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimEventBridgeSdkCommandRouter(this);

  constructor(properties: SimEventBridgeProperties = {}) {
    super();

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
      targets: this.targets,
      deliveryTargets: properties.deliveryTargets,
      iam,
      background,
      accountRegionScope,
    });
  }

  /**
   * Every event this scope's rules could not get to a target.
   *
   * Real EventBridge tells the caller nothing about a failed delivery, and
   * neither does this. A target that is unexpectedly empty is explained here.
   */
  get deliveryFailures(): readonly SimEventBridgeDeliveryFailure[] {
    return this.commands.router.deliveryFailures;
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
   * Handle a PutTargets Command from the SDK.
   */
  async putTargets(
    command: simEventBridgeCommands.SimPutTargetsCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimPutTargetsCommandOutput> {
    await this.background.sequence();
    return this.commands.targetCreation.handle(command, options);
  }

  /**
   * Handle a RemoveTargets Command from the SDK.
   */
  async removeTargets(
    command: simEventBridgeCommands.SimRemoveTargetsCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimRemoveTargetsCommandOutput> {
    await this.background.sequence();
    return this.commands.targets.removeTargets(command, options);
  }

  /**
   * Handle a ListTargetsByRule Command from the SDK.
   */
  async listTargetsByRule(
    command: simEventBridgeCommands.SimListTargetsByRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimListTargetsByRuleCommandOutput> {
    await this.background.sequence();
    return this.commands.targets.listTargetsByRule(command, options);
  }

  /**
   * Handle a ListRuleNamesByTarget Command from the SDK.
   */
  async listRuleNamesByTarget(
    command: simEventBridgeCommands.SimListRuleNamesByTargetCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimListRuleNamesByTargetCommandOutput> {
    await this.background.sequence();
    return this.commands.targets.listRuleNamesByTarget(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
