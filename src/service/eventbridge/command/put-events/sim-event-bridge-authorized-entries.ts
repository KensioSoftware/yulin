import type { SimEventBridgeBusAccess } from "../bus/sim-event-bridge-bus-access.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import type { SimPutEventsRequestEntry } from "./put-events.command.js";

/**
 * One entry, and the name of the bus the caller is allowed to put it on.
 */
export interface SimEventBridgeAuthorizedEntry {
  readonly entry: SimPutEventsRequestEntry;
  readonly busName: string;
}

/**
 * Resolve and authorize the bus every entry names, before any of them is
 * delivered.
 *
 * Authorizing entry by entry as each is delivered would leave a refused
 * request half done: an earlier entry's event would already be on its bus when
 * a later entry's refusal threw. Every entry is decided here first, so a
 * request that throws has changed nothing.
 */
export function authorizedEntries(
  entries: readonly SimPutEventsRequestEntry[],
  access: SimEventBridgeBusAccess,
  options: SimEventBridgeRequestOptions | undefined,
): readonly SimEventBridgeAuthorizedEntry[] {
  return entries.map((entry) => {
    const busName = access.requestedName(entry.EventBusName);

    access.authorizeName("events:PutEvents", busName, options);

    return { entry, busName: busName.value };
  });
}
