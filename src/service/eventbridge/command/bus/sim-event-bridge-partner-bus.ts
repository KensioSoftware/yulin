import type { SimEventBusName } from "../../bus/sim-event-bus-name.js";
import { SimEventBridgeValidationException } from "../../error/sim-event-bridge.error.js";
import { SimPartnerEventSourceName } from "../../source/sim-partner-event-source-name.js";
import type { SimPartnerEventSourceStore } from "../../source/sim-partner-event-source-store.js";

/**
 * Checks the name a bus is created under against the partner event source a
 * CreateEventBus request names, if it names one.
 *
 * A partner event bus has to take the name of its source exactly, and only a
 * partner event bus may carry a `/` in its name. The source has to exist
 * already. A partner creates it from its own Account, and real EventBridge
 * fails the request when there is no source to match.
 */
export class SimEventBridgePartnerBus {
  private readonly sources: SimPartnerEventSourceStore;

  constructor(sources: SimPartnerEventSourceStore) {
    this.sources = sources;
  }

  /**
   * Refuse a bus name that does not fit the source the request names, or a
   * source that is not there.
   */
  check(name: SimEventBusName, eventSourceName: string | undefined): void {
    if (eventSourceName === undefined) {
      this.refusePartnerName(name);
      return;
    }

    const sourceName = SimPartnerEventSourceName.of(
      eventSourceName,
      "EventSourceName",
    );

    if (sourceName.value !== name.value) {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Name Reason: a partner event bus takes the name ` +
          `of its event source exactly, and '${name.value}' is not ` +
          `'${sourceName.value}'.`,
      );
    }

    this.sources.require(sourceName.value);
  }

  /**
   * Refuse a partner bus name on a request that names no partner source.
   */
  private refusePartnerName(name: SimEventBusName): void {
    if (name.isPartner) {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Name Reason: custom event bus names cannot ` +
          `contain the '/' character. '${name.value}' is a partner event bus ` +
          `name, and a partner event bus is created with an EventSourceName.`,
      );
    }
  }
}
