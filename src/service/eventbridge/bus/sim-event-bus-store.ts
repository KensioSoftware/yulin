import { SimEventBridgeResourceNotFoundException } from "../error/sim-event-bridge.error.js";
import type { SimEventBus } from "./sim-event-bus.js";

/**
 * The event buses of one simulated EventBridge scope.
 *
 * Buses are keyed by name, which is unique within one Account and Region. The
 * default bus is put here when the scope is built rather than created by a
 * request, which is what makes it available to an Account that has never
 * called EventBridge at all.
 */
export class SimEventBusStore {
  private readonly buses = new Map<string, SimEventBus>();

  constructor(defaultBus: SimEventBus) {
    this.add(defaultBus);
  }

  /**
   * Every bus in this scope, in creation order, starting with the default one.
   */
  get all(): readonly SimEventBus[] {
    return this.buses.values().toArray();
  }

  /**
   * Store a newly created bus.
   */
  add(bus: SimEventBus): void {
    this.buses.set(bus.name.value, bus);
  }

  /**
   * Find a bus by name.
   */
  find(name: string): SimEventBus | undefined {
    return this.buses.get(name);
  }

  /**
   * Resolve a bus by name, or refuse.
   */
  require(name: string): SimEventBus {
    const found = this.find(name);

    if (found === undefined) {
      throw new SimEventBridgeResourceNotFoundException(
        `Event bus ${name} does not exist.`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted bus.
   */
  remove(bus: SimEventBus): void {
    this.buses.delete(bus.name.value);
  }
}
