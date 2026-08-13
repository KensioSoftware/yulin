import { randomUUID } from "node:crypto";

import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import { SimEventBridgeEvent } from "../../event/sim-event-bridge-event.js";
import { SimEventBridgeEntryFailure } from "./sim-event-bridge-entry-failure.js";
import type { SimPutEventsRequestEntry } from "./put-events.command.js";

/**
 * The longest `DetailType` real EventBridge takes.
 */
const maximumDetailTypeLength = 128;

/**
 * Whether an entry carries everything a routable event needs.
 *
 * A request in which no entry does at all is refused outright, which is why
 * this is asked of every entry before any of them is read.
 */
export function isRoutableEntry(entry: SimPutEventsRequestEntry): boolean {
  return (
    entry.Source !== undefined &&
    entry.DetailType !== undefined &&
    entry.Detail !== undefined
  );
}

/**
 * Read an entry's `Detail` as the JSON object it has to be.
 *
 * Anything that is not an object is malformed, including a JSON array, number
 * or string, since a rule's event pattern matches fields of an object and has
 * nothing to match against otherwise.
 */
function readDetail(detail: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(detail);

    if (!isRecord(parsed)) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * One entry, once it is known to carry everything an event needs.
 */
interface SimEventBridgeReadEntry {
  readonly entry: SimPutEventsRequestEntry;
  readonly source: string;
  readonly detailType: string;
  readonly detail: string;
  readonly at: Date;
}

interface SimEventBridgeEntryReaderProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Reads one PutEvents entry into the event EventBridge would build from it.
 *
 * `Detail`, `DetailType` and `Source` are all optional in the API model and
 * all required for an entry to be taken, so this is where that gap is closed.
 * An entry missing one comes back as a failure rather than a thrown error,
 * because the rest of the request still goes through.
 */
export class SimEventBridgeEntryReader {
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimEventBridgeEntryReaderProperties) {
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Read an entry into an event, or into the failure it comes back as.
   *
   * The timestamp is the one the entry carries, or the instant of the call
   * when it carries none, which is what puts a simulation's own clock on every
   * event that did not name a time.
   */
  read(
    entry: SimPutEventsRequestEntry,
    at: Date,
  ): SimEventBridgeEvent | SimEventBridgeEntryFailure {
    if (entry.Source === undefined) {
      return SimEventBridgeEntryFailure.missing("Source");
    }

    if (entry.DetailType === undefined) {
      return SimEventBridgeEntryFailure.missing("DetailType");
    }

    if (entry.Detail === undefined) {
      return SimEventBridgeEntryFailure.missing("Detail");
    }

    if (entry.DetailType.length > maximumDetailTypeLength) {
      return SimEventBridgeEntryFailure.detailTypeTooLong(
        entry.DetailType.length,
      );
    }

    return this.eventFrom({
      entry,
      source: entry.Source,
      detailType: entry.DetailType,
      detail: entry.Detail,
      at,
    });
  }

  /**
   * Build the event, once the entry is known to carry what one needs.
   */
  private eventFrom(
    read: SimEventBridgeReadEntry,
  ): SimEventBridgeEvent | SimEventBridgeEntryFailure {
    const detail = readDetail(read.detail);

    if (detail === undefined) {
      return SimEventBridgeEntryFailure.malformedDetail();
    }

    return new SimEventBridgeEvent({
      id: randomUUID(),
      detailType: read.detailType,
      source: read.source,
      account: this.accountRegionScope.accountId,
      time: read.entry.Time ?? read.at,
      region: this.accountRegionScope.regionName,
      resources: read.entry.Resources ?? [],
      detail,
    });
  }
}
