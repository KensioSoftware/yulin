import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEventBridgeEvent } from "../event/sim-event-bridge-event.js";
import { SimEventBusArn } from "./sim-event-bus-arn.js";
import { SimEventBusName } from "./sim-event-bus-name.js";

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

  private readonly received: SimEventBridgeEvent[] = [];

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
    return [...this.received];
  }

  /**
   * Take an event onto this bus.
   *
   * Today that only records it. Matching it against the bus's rules, and
   * sending it to their targets, is what a later change adds here.
   */
  receive(event: SimEventBridgeEvent): void {
    this.received.push(event);
  }
}
