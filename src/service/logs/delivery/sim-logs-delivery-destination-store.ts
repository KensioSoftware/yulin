import {
  SimLogsResourceNotFoundException,
  SimLogsValidationException,
} from "../error/sim-logs.error.js";
import type { SimLogsDeliveryDestination } from "./sim-logs-delivery-destination.js";

/**
 * The delivery destinations of one simulated CloudWatch Logs scope.
 *
 * Destinations are keyed by name. The output format is fixed once the
 * destination exists, so changing it means deleting the destination and making
 * it again, which is a replacement in a template and a two step change through
 * the SDK.
 */
export class SimLogsDeliveryDestinationStore {
  readonly #destinations = new Map<string, SimLogsDeliveryDestination>();

  /**
   * Every delivery destination in this scope, in the order they were put.
   */
  get all(): readonly SimLogsDeliveryDestination[] {
    return this.#destinations.values().toArray();
  }

  /**
   * Put a delivery destination, updating one of the same name.
   *
   * A put that would change the output format is refused rather than applied,
   * because a destination silently rewritten to another format would leave
   * every reader of what it wrote parsing the wrong thing.
   */
  put(destination: SimLogsDeliveryDestination): void {
    const existing = this.find(destination.name);

    if (
      existing !== undefined &&
      existing.outputFormat !== destination.outputFormat
    ) {
      throw new SimLogsValidationException(
        `Delivery destination '${destination.name}' was created with ` +
          `output format '${existing.outputFormat}', which cannot be ` +
          `changed to '${destination.outputFormat}'`,
      );
    }

    this.#destinations.set(destination.name, destination);
  }

  /**
   * Find a delivery destination by name.
   */
  find(name: string): SimLogsDeliveryDestination | undefined {
    return this.#destinations.get(name);
  }

  /**
   * Get a delivery destination by name, refusing one that is not there.
   */
  require(name: string): SimLogsDeliveryDestination {
    const destination = this.find(name);

    if (destination === undefined) {
      throw new SimLogsResourceNotFoundException(
        `Delivery destination '${name}' does not exist`,
      );
    }

    return destination;
  }

  /**
   * Get a delivery destination by its own ARN, refusing one that is not there.
   */
  requireByArn(arn: string): SimLogsDeliveryDestination {
    const destination = this.all.find((candidate) => candidate.arn === arn);

    if (destination === undefined) {
      throw new SimLogsResourceNotFoundException(
        `Delivery destination '${arn}' does not exist`,
      );
    }

    return destination;
  }

  /**
   * Remove a delivery destination, refusing one that is not there.
   */
  delete(name: string): void {
    this.require(name);
    this.#destinations.delete(name);
  }
}
