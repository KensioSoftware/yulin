import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";
import { isRoutableEntry } from "./sim-event-bridge-entry-reader.js";
import {
  simEventBridgeMaximumRequestBytes,
  simEventBridgeRequestSize,
} from "./sim-event-bridge-entry-size.js";
import type {
  SimPutEventsCommandInput,
  SimPutEventsRequestEntry,
} from "./put-events.command.js";

/**
 * The most entries one PutEvents request may carry.
 */
const maximumEntries = 10;

/**
 * Read the entries a PutEvents request carries, refusing a request
 * EventBridge would not take at all.
 *
 * These are the refusals that apply to the request rather than to an entry.
 * Everything else about an entry is that entry's own failure, reported in its
 * place in the result while the rest of the request goes through.
 *
 * The last of them is EventBridge's own rule: an entry missing `Detail`,
 * `DetailType` or `Source` fails on its own, but a request in which no entry
 * carries all three fails outright.
 */
export function putEventsRequestEntries(
  input: SimPutEventsCommandInput,
): readonly SimPutEventsRequestEntry[] {
  if (input.EndpointId !== undefined) {
    throw new SimEventBridgeUnsimulatedInputException(
      "Global endpoints are not simulated, so PutEvents refuses an " +
        "EndpointId rather than ignoring it and putting the event on this " +
        "Region's bus",
    );
  }

  const entries = input.Entries ?? [];

  refuseUnusableCount(entries.length);
  refuseOversizedRequest(entries);

  if (entries.every((entry) => !isRoutableEntry(entry))) {
    throw new SimEventBridgeValidationException(
      "Invalid parameter: Entries Reason: no entry carries Detail, " +
        "DetailType and Source, all of which an event needs to be routed",
    );
  }

  return entries;
}

/**
 * Refuse a request carrying no entries, or more than a request may.
 */
function refuseUnusableCount(count: number): void {
  if (count === 0 || count > maximumEntries) {
    throw new SimEventBridgeValidationException(
      `Invalid parameter: Entries Reason: a PutEvents request carries ` +
        `between 1 and ${String(maximumEntries)} entries, and this one ` +
        `carries ${String(count)}`,
    );
  }
}

/**
 * Refuse a request whose entries come to more than the limit together.
 *
 * The limit is on the request rather than on any one entry, so a single entry
 * may use the whole of it.
 */
function refuseOversizedRequest(
  entries: readonly SimPutEventsRequestEntry[],
): void {
  const size = simEventBridgeRequestSize(entries);

  if (size > simEventBridgeMaximumRequestBytes) {
    throw new SimEventBridgeValidationException(
      `Total size of the entries in the request is ${String(size)} bytes, ` +
        `which is over the ${String(simEventBridgeMaximumRequestBytes)} byte ` +
        `limit.`,
    );
  }
}
