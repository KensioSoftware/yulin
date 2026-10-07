import {
  SimEventBridgeResourceAlreadyExistsException,
  SimEventBridgeResourceNotFoundException,
} from "../error/sim-event-bridge.error.js";
import type { SimPartnerEventSource } from "./sim-partner-event-source.js";

/**
 * The partner event sources shared with one simulated EventBridge scope.
 *
 * Sources are keyed by name. A partner names each one uniquely across every
 * Account it serves, so a name is enough to find one.
 */
export class SimPartnerEventSourceStore {
  private readonly sources = new Map<string, SimPartnerEventSource>();

  /**
   * Store a newly created source, refusing a name already taken.
   */
  add(source: SimPartnerEventSource): void {
    if (this.sources.has(source.name.value)) {
      throw new SimEventBridgeResourceAlreadyExistsException(
        `Event source ${source.name.value} already exists.`,
      );
    }

    this.sources.set(source.name.value, source);
  }

  /**
   * Resolve a source by name, or refuse.
   */
  require(name: string): SimPartnerEventSource {
    const found = this.sources.get(name);

    if (found === undefined) {
      throw new SimEventBridgeResourceNotFoundException(
        `Event source ${name} does not exist.`,
      );
    }

    return found;
  }
}
