import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimEventBridgeValidationException } from "../../error/sim-event-bridge.error.js";
import type { SimEventBridgeRouter } from "../../routing/sim-event-bridge-router.js";
import type { SimPartnerEventSourceStore } from "../../source/sim-partner-event-source-store.js";
import { SimEventBridgeEntryFailure } from "../put-events/sim-event-bridge-entry-failure.js";
import { SimEventBridgeEntryReader } from "../put-events/sim-event-bridge-entry-reader.js";
import {
  simEventBridgeMaximumRequestBytes,
  simEventBridgeRequestSize,
} from "../put-events/sim-event-bridge-entry-size.js";
import type {
  SimPutPartnerEventsCommand,
  SimPutPartnerEventsCommandOutput,
  SimPutPartnerEventsRequestEntry,
  SimPutPartnerEventsResultEntry,
} from "./source.command.js";

/**
 * The most entries one PutPartnerEvents request may carry.
 */
const maximumEntries = 20;

interface SimEventBridgePutPartnerEventsProperties {
  readonly sources: SimPartnerEventSourceStore;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: BackgroundScheduler;
  readonly router: SimEventBridgeRouter;
}

/**
 * Puts events onto partner event buses as their SaaS partner would.
 *
 * Each entry's `Source` names the partner event source it comes from, and the
 * event goes to the bus of the same name. An event for a source with no bus is
 * dropped. Real EventBridge documents that it keeps nothing a partner sends
 * before the receiving Account creates the bus.
 *
 * Nothing is authorized. The partner sends from its own Account, which is
 * outside the simulation, and the receiving Account's IAM has no say in it.
 */
export class SimEventBridgePutPartnerEvents {
  private readonly sources: SimPartnerEventSourceStore;
  private readonly clock: BackgroundScheduler;
  private readonly router: SimEventBridgeRouter;
  private readonly reader: SimEventBridgeEntryReader;

  constructor(properties: SimEventBridgePutPartnerEventsProperties) {
    this.sources = properties.sources;
    this.clock = properties.clock;
    this.router = properties.router;
    this.reader = new SimEventBridgeEntryReader({
      accountRegionScope: properties.accountRegionScope,
    });
  }

  /**
   * Put a partner's events onto the buses of their sources.
   *
   * Every `Source` is resolved before any event is put, so a request naming a
   * source that was never registered changes nothing.
   */
  handle(
    command: SimPutPartnerEventsCommand,
  ): SimPutPartnerEventsCommandOutput {
    const entries = partnerRequestEntries(command.input.Entries ?? []);

    for (const entry of entries) {
      if (entry.Source !== undefined) {
        this.sources.require(entry.Source);
      }
    }

    const at = this.clock.now();
    const results = entries.map((entry) => this.put(entry, at));

    return {
      $metadata: {},
      Entries: results,
      FailedEntryCount: results.filter(
        (result) => result.ErrorCode !== undefined,
      ).length,
    };
  }

  /**
   * Put one entry onto the bus its source names.
   */
  private put(
    entry: SimPutPartnerEventsRequestEntry,
    at: Date,
  ): SimPutPartnerEventsResultEntry {
    const read = this.reader.read(entry, at);

    if (read instanceof SimEventBridgeEntryFailure) {
      return read.toResultEntry();
    }

    this.router.deliver(read.source, read);

    return { EventId: read.id };
  }
}

/**
 * Refuse a request carrying no entries, too many, or too many bytes.
 */
function partnerRequestEntries(
  entries: readonly SimPutPartnerEventsRequestEntry[],
): readonly SimPutPartnerEventsRequestEntry[] {
  if (entries.length === 0 || entries.length > maximumEntries) {
    throw new SimEventBridgeValidationException(
      `Invalid parameter: Entries Reason: a PutPartnerEvents request carries ` +
        `between 1 and ${String(maximumEntries)} entries, and this one ` +
        `carries ${String(entries.length)}`,
    );
  }

  const size = simEventBridgeRequestSize(entries);

  if (size > simEventBridgeMaximumRequestBytes) {
    throw new SimEventBridgeValidationException(
      `Total size of the entries in the request is ${String(size)} bytes, ` +
        `which is over the ${String(simEventBridgeMaximumRequestBytes)} byte ` +
        `limit.`,
    );
  }

  return entries;
}
