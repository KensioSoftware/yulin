import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEventBridgeEvent } from "../event/sim-event-bridge-event.js";
import { SimEventBusArn } from "./sim-event-bus-arn.js";
import { SimEventBusName } from "./sim-event-bus-name.js";

/**
 * One event a bus took, and the rules on that bus it matched.
 */
export interface SimEventBusReceipt {
  readonly event: SimEventBridgeEvent;
  readonly matchedRuleNames: readonly string[];
}

interface SimEventBusProperties {
  readonly name: SimEventBusName;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createdAt: Date;
  readonly description?: string | undefined;
}

/**
 * One simulated event bus.
 *
 * A bus is a router rather than a store: real EventBridge keeps no events, and
 * an event that matches no rule is gone as soon as it arrives. The events this
 * class keeps are a simulator affordance so a test can see what a bus
 * received, not modelled AWS state, and nothing an SDK command returns is
 * built from them.
 */
export class SimEventBus {
  public readonly name: SimEventBusName;
  public readonly arn: SimEventBusArn;
  public readonly creationTime: Date;
  public readonly description: string | undefined;

  private readonly received: SimEventBusReceipt[] = [];

  constructor(properties: SimEventBusProperties) {
    this.name = properties.name;
    this.arn = new SimEventBusArn({
      name: properties.name,
      accountRegionScope: properties.accountRegionScope,
    });
    this.creationTime = properties.createdAt;
    this.description = properties.description;
  }

  /**
   * The default event bus, which every Account and Region has without one
   * being created.
   */
  static default(properties: {
    readonly accountRegionScope: SimAwsAccountRegionScope;
    readonly createdAt: Date;
  }): SimEventBus {
    return new this({
      name: SimEventBusName.default(),
      accountRegionScope: properties.accountRegionScope,
      createdAt: properties.createdAt,
    });
  }

  /**
   * Every event this bus has received, in arrival order.
   *
   * This is the simulator's own accessor, for a test asserting on what
   * EventBridge built from a PutEvents entry. Real EventBridge offers nothing
   * like it without an archive.
   */
  get receivedEvents(): readonly SimEventBridgeEvent[] {
    return this.received.map((receipt) => receipt.event);
  }

  /**
   * Every event this bus received, with the rules each one matched.
   *
   * This is the simulator's own accessor, for a test asserting on routing
   * before it has a target to watch. Real EventBridge keeps nothing like it.
   */
  get receipts(): readonly SimEventBusReceipt[] {
    return [...this.received];
  }

  /**
   * Take an event onto this bus, along with the rules it matched.
   *
   * The matching is done before the event gets here rather than by the bus
   * itself, because a bus holds no rules: they are keyed by bus in their own
   * store, the same way a topic's subscriptions are in simulated SNS. Sending
   * the event on to each matched rule's targets is what a later change adds.
   */
  receive(
    event: SimEventBridgeEvent,
    matchedRuleNames: readonly string[],
  ): void {
    this.received.push({ event, matchedRuleNames });
  }
}
