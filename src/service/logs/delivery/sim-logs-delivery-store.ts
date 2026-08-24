import {
  SimLogsConflictException,
  SimLogsResourceNotFoundException,
} from "../error/sim-logs.error.js";
import type { SimLogsDelivery } from "./sim-logs-delivery.js";

/**
 * The deliveries of one simulated CloudWatch Logs scope.
 *
 * Deliveries are keyed by the identifier CloudWatch Logs issued for them. One
 * source and destination pair may be joined only once, so a second delivery
 * for the same pair is refused rather than left duplicating the first.
 */
export class SimLogsDeliveryStore {
  readonly #deliveries = new Map<string, SimLogsDelivery>();

  /**
   * Every delivery in this scope, in the order they were created.
   */
  get all(): readonly SimLogsDelivery[] {
    return this.#deliveries.values().toArray();
  }

  /**
   * Add a delivery, refusing a source and destination pair already joined.
   */
  add(delivery: SimLogsDelivery): void {
    const joined = this.all.some(
      (existing) =>
        existing.deliverySourceName === delivery.deliverySourceName &&
        existing.deliveryDestinationArn === delivery.deliveryDestinationArn,
    );

    if (joined) {
      throw new SimLogsConflictException(
        `Delivery source '${delivery.deliverySourceName}' already delivers ` +
          `to '${delivery.deliveryDestinationArn}'`,
      );
    }

    this.#deliveries.set(delivery.id, delivery);
  }

  /**
   * Find a delivery by its identifier.
   */
  find(id: string): SimLogsDelivery | undefined {
    return this.#deliveries.get(id);
  }

  /**
   * Get a delivery by its identifier, refusing one that is not there.
   */
  require(id: string): SimLogsDelivery {
    const delivery = this.find(id);

    if (delivery === undefined) {
      throw new SimLogsResourceNotFoundException(
        `Delivery '${id}' does not exist`,
      );
    }

    return delivery;
  }

  /**
   * Remove a delivery, refusing one that is not there.
   */
  delete(id: string): void {
    this.require(id);
    this.#deliveries.delete(id);
  }
}
