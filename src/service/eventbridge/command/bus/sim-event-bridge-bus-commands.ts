import type { SimEventBusStore } from "../../bus/sim-event-bus-store.js";
import { SimEventBridgePage } from "../sim-event-bridge-page.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import type { SimEventBridgeBusAccess } from "./sim-event-bridge-bus-access.js";
import {
  listedEventBus,
  listedEventBuses,
} from "./sim-event-bridge-listed-bus.js";
import type {
  SimDescribeEventBusCommand,
  SimDescribeEventBusCommandOutput,
  SimListEventBusesCommand,
  SimListEventBusesCommandOutput,
} from "./bus.command.js";

interface SimEventBridgeBusCommandsProperties {
  readonly buses: SimEventBusStore;
  readonly access: SimEventBridgeBusAccess;
}

/**
 * The commands that read event buses back.
 *
 * Creating and deleting one are their own handlers, since each carries rules
 * of its own about which names it will take. Describing and listing carry
 * none, and report the same fields as each other.
 */
export class SimEventBridgeBusCommands {
  private readonly buses: SimEventBusStore;
  private readonly access: SimEventBridgeBusAccess;

  constructor(properties: SimEventBridgeBusCommandsProperties) {
    this.buses = properties.buses;
    this.access = properties.access;
  }

  /**
   * Describe an event bus, by name or ARN.
   *
   * A request naming no bus describes the default one, as it does on real AWS.
   */
  describeEventBus(
    command: SimDescribeEventBusCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimDescribeEventBusCommandOutput {
    const bus = this.access.require(
      "events:DescribeEventBus",
      command.input.Name,
      options,
    );

    return { $metadata: {}, ...listedEventBus(bus) };
  }

  /**
   * List the buses in this scope, the default one first.
   *
   * Real EventBridge gives this action no bus-level permission, so it
   * authorizes against every bus in the Account and Region and does not filter
   * the list by what the caller can reach.
   */
  listEventBuses(
    command: SimListEventBusesCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimListEventBusesCommandOutput {
    const input = command.input;

    this.access.authorizeAnyBus("events:ListEventBuses", options);

    const page = new SimEventBridgePage(
      listedEventBuses(this.buses.all, input.NamePrefix),
      input.Limit,
      input.NextToken,
    );

    return {
      $metadata: {},
      EventBuses: page.items,
      NextToken: page.nextToken,
    };
  }
}
