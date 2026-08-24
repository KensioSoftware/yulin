import type { SimLogsDeliveryDestination } from "./delivery/sim-logs-delivery-destination.js";
import type { SimLogsDeliverySource } from "./delivery/sim-logs-delivery-source.js";
import type { SimLogsDelivery } from "./delivery/sim-logs-delivery.js";
import type { SimLogsCommands } from "./sim-logs-commands.js";

/**
 * What a test or another part of the simulation can ask a simulated CloudWatch
 * Logs about the delivery resources it holds.
 *
 * These are the simulator's own accessors rather than simulated API
 * operations. They go through no command and no authorization. That is what
 * the CloudFormation Resource factory reads a created Resource back through.
 */
export abstract class SimLogsDeliveryInspection {
  protected abstract readonly commands: SimLogsCommands;

  /** Find a delivery source by name. */
  findDeliverySource(name: string): SimLogsDeliverySource | undefined {
    return this.commands.deliverySourceStore.find(name);
  }

  /** Every delivery source in this scope, in the order they were put. */
  allDeliverySources(): readonly SimLogsDeliverySource[] {
    return this.commands.deliverySourceStore.all;
  }

  /** Find a delivery destination by name. */
  findDeliveryDestination(
    name: string,
  ): SimLogsDeliveryDestination | undefined {
    return this.commands.deliveryDestinationStore.find(name);
  }

  /** Every delivery destination in this scope, in the order they were put. */
  allDeliveryDestinations(): readonly SimLogsDeliveryDestination[] {
    return this.commands.deliveryDestinationStore.all;
  }

  /** Find a delivery by the identifier CloudWatch Logs issued for it. */
  findDelivery(id: string): SimLogsDelivery | undefined {
    return this.commands.deliveryStore.find(id);
  }

  /** Every delivery in this scope, in the order they were created. */
  allDeliveries(): readonly SimLogsDelivery[] {
    return this.commands.deliveryStore.all;
  }
}
