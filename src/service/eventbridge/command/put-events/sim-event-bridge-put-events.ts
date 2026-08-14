import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimEventBridgeRouter } from "../../routing/sim-event-bridge-router.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import type { SimEventBridgeBusAccess } from "../bus/sim-event-bridge-bus-access.js";
import {
  type SimEventBridgeAuthorizedEntry,
  authorizedEntries,
} from "./sim-event-bridge-authorized-entries.js";
import { SimEventBridgeEntryFailure } from "./sim-event-bridge-entry-failure.js";
import { SimEventBridgeEntryReader } from "./sim-event-bridge-entry-reader.js";
import { putEventsRequestEntries } from "./sim-event-bridge-request-entries.js";
import type {
  SimPutEventsCommand,
  SimPutEventsCommandOutput,
  SimPutEventsResultEntry,
} from "./put-events.command.js";

interface SimEventBridgePutEventsProperties {
  readonly access: SimEventBridgeBusAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: BackgroundScheduler;
  readonly router: SimEventBridgeRouter;
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
  private readonly access: SimEventBridgeBusAccess;
  private readonly clock: BackgroundScheduler;
  private readonly router: SimEventBridgeRouter;
  private readonly reader: SimEventBridgeEntryReader;

  constructor(properties: SimEventBridgePutEventsProperties) {
    this.access = properties.access;
    this.clock = properties.clock;
    this.router = properties.router;
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

    const results = authorizedEntries(entries, this.access, options).map(
      (authorized) => this.put(authorized, at),
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

    this.router.deliver(authorized.busName, read);

    return { EventId: read.id };
  }
}
