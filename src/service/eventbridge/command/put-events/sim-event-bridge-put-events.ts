import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimEventBusStore } from "../../bus/sim-event-bus-store.js";
import type { SimEventBridgeEvent } from "../../event/sim-event-bridge-event.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import type { SimEventBridgeBusAccess } from "../bus/sim-event-bridge-bus-access.js";
import { SimEventBridgeEntryFailure } from "./sim-event-bridge-entry-failure.js";
import { SimEventBridgeEntryReader } from "./sim-event-bridge-entry-reader.js";
import { putEventsRequestEntries } from "./sim-event-bridge-request-entries.js";
import type {
  SimPutEventsCommand,
  SimPutEventsCommandOutput,
  SimPutEventsRequestEntry,
  SimPutEventsResultEntry,
} from "./put-events.command.js";

/**
 * One entry, and the name of the bus the caller is allowed to put it on.
 */
interface SimEventBridgeAuthorizedEntry {
  readonly entry: SimPutEventsRequestEntry;
  readonly busName: string;
}

interface SimEventBridgePutEventsProperties {
  readonly buses: SimEventBusStore;
  readonly access: SimEventBridgeBusAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: BackgroundScheduler;
}

/**
 * The PutEvents command.
 *
 * Entries are independent: one that EventBridge will not take comes back as a
 * failure in its own place in the result while the rest go through, and each
 * entry may name a different bus.
 *
 * An entry naming a bus that does not exist succeeds. Real EventBridge answers
 * 200, finds no rule to match the event against, and drops it, without
 * counting the entry as failed. That is a trap worth knowing about, since a
 * mistyped bus name looks exactly like a working call, so this simulation
 * reproduces it rather than being helpfully stricter.
 */
export class SimEventBridgePutEvents {
  private readonly buses: SimEventBusStore;
  private readonly access: SimEventBridgeBusAccess;
  private readonly clock: BackgroundScheduler;
  private readonly reader: SimEventBridgeEntryReader;

  constructor(properties: SimEventBridgePutEventsProperties) {
    this.buses = properties.buses;
    this.access = properties.access;
    this.clock = properties.clock;
    this.reader = new SimEventBridgeEntryReader({
      accountRegionScope: properties.accountRegionScope,
    });
  }

  /**
   * Put events onto the buses their entries name.
   *
   * Every entry is stamped with the one instant the call was made at, rather
   * than each reading the clock again, so a request's events share a timestamp
   * as they do on real AWS.
   */
  handle(
    command: SimPutEventsCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimPutEventsCommandOutput {
    const entries = putEventsRequestEntries(command.input);
    const at = this.clock.now();

    const results = this.authorized(entries, options).map((authorized) =>
      this.put(authorized, at),
    );

    return {
      $metadata: {},
      Entries: results,
      FailedEntryCount: results.filter(
        (result) => result.ErrorCode !== undefined,
      ).length,
    };
  }

  /**
   * Resolve and authorize the bus every entry names, before any of them is
   * delivered.
   *
   * Authorizing entry by entry as each is delivered would leave a refused
   * request half done: an earlier entry's event would already be on its bus
   * when a later entry's refusal threw. Every entry is therefore decided
   * first, so a request that throws has changed nothing.
   */
  private authorized(
    entries: readonly SimPutEventsRequestEntry[],
    options: SimEventBridgeRequestOptions | undefined,
  ): readonly SimEventBridgeAuthorizedEntry[] {
    return entries.map((entry) => {
      const busName = this.access.requestedName(entry.EventBusName);

      this.access.authorizeName("events:PutEvents", busName, options);

      return { entry, busName: busName.value };
    });
  }

  /**
   * Put one authorized entry onto the bus it names.
   *
   * A bus that is not there takes the event nowhere, and the entry still
   * succeeds.
   */
  private put(
    authorized: SimEventBridgeAuthorizedEntry,
    at: Date,
  ): SimPutEventsResultEntry {
    const read = this.reader.read(authorized.entry, at);

    if (read instanceof SimEventBridgeEntryFailure) {
      return read.toResultEntry();
    }

    this.deliver(authorized.busName, read);

    return { EventId: read.id };
  }

  /**
   * Hand an event to the bus it was put onto, where there is one.
   */
  private deliver(busName: string, event: SimEventBridgeEvent): void {
    this.buses.find(busName)?.receive(event);
  }
}
