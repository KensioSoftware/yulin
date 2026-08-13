import type { SimPutEventsRequestEntry } from "./put-events.command.js";

/**
 * The size real EventBridge counts a `Time` as, whatever the instant is.
 */
const timeSizeBytes = 14;

/**
 * The most one PutEvents request may total.
 *
 * The limit is on the request rather than on any one entry, so a single entry
 * may use the whole of it.
 */
export const simEventBridgeMaximumRequestBytes = 1_048_576;

/**
 * Measure one PutEvents entry the way real EventBridge measures it.
 *
 * This is AWS's own documented calculation rather than the size of the JSON on
 * the wire: a `Time` counts as a flat 14 bytes, and `Source`, `DetailType`,
 * `Detail` and each entry of `Resources` count as the length of their UTF-8
 * encoded forms. Nothing else in the entry counts at all, which is why a
 * `TraceHeader` or an `EventBusName` is free.
 *
 * https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-putevents.html#eb-putevent-size
 */
export function simEventBridgeEntrySize(
  entry: SimPutEventsRequestEntry,
): number {
  const resources = entry.Resources ?? [];

  return (
    timeSize(entry.Time) +
    utf8Length(entry.Source) +
    utf8Length(entry.DetailType) +
    utf8Length(entry.Detail) +
    resources.reduce((total, resource) => total + utf8Length(resource), 0)
  );
}

/**
 * Measure every entry of a request together, which is what the limit applies
 * to.
 */
export function simEventBridgeRequestSize(
  entries: readonly SimPutEventsRequestEntry[],
): number {
  return entries.reduce(
    (total, entry) => total + simEventBridgeEntrySize(entry),
    0,
  );
}

/**
 * What a `Time` counts towards the total, which is a flat rate or nothing.
 */
function timeSize(time: Date | undefined): number {
  if (time === undefined) {
    return 0;
  }

  return timeSizeBytes;
}

/**
 * The number of bytes a string takes in UTF-8, or none for an absent one.
 */
function utf8Length(value: string | undefined): number {
  if (value === undefined) {
    return 0;
  }

  return Buffer.byteLength(value, "utf8");
}
