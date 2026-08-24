import {
  SimLogsConflictException,
  SimLogsResourceNotFoundException,
} from "../error/sim-logs.error.js";
import type { SimLogsDeliverySource } from "./sim-logs-delivery-source.js";

/**
 * The delivery sources of one simulated CloudWatch Logs scope.
 *
 * Sources are keyed by name, and a second key matters just as much: one
 * resource may have only one delivery source in an account. A distribution
 * that already has logging set up therefore refuses a second source, which is
 * the failure anyone adding a second construct to an existing distribution
 * runs into.
 */
export class SimLogsDeliverySourceStore {
  readonly #sources = new Map<string, SimLogsDeliverySource>();

  /**
   * Every delivery source in this scope, in the order they were put.
   */
  get all(): readonly SimLogsDeliverySource[] {
    return this.#sources.values().toArray();
  }

  /**
   * Put a delivery source, replacing one of the same name.
   *
   * Putting an existing name again is an update, as it is on real CloudWatch
   * Logs. Putting a new name for a resource that already has a source is the
   * conflict.
   */
  put(source: SimLogsDeliverySource): void {
    const holder = this.withResourceArn(source.resourceArn);

    if (holder !== undefined && holder.name !== source.name) {
      throw new SimLogsConflictException(
        "This ResourceId has already been used in another Delivery Source " +
          "in this account",
      );
    }

    this.#sources.set(source.name, source);
  }

  /**
   * The delivery source covering a resource, if it has one.
   */
  withResourceArn(resourceArn: string): SimLogsDeliverySource | undefined {
    return this.all.find((source) => source.resourceArn === resourceArn);
  }

  /**
   * Find a delivery source by name.
   */
  find(name: string): SimLogsDeliverySource | undefined {
    return this.#sources.get(name);
  }

  /**
   * Get a delivery source by name, refusing one that is not there.
   */
  require(name: string): SimLogsDeliverySource {
    const source = this.find(name);

    if (source === undefined) {
      throw new SimLogsResourceNotFoundException(
        `Delivery source '${name}' does not exist`,
      );
    }

    return source;
  }

  /**
   * Remove a delivery source, refusing one that is not there.
   */
  delete(name: string): void {
    this.require(name);
    this.#sources.delete(name);
  }
}
