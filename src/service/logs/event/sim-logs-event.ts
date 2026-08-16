/**
 * What real CloudWatch Logs adds to each event when it measures a batch.
 *
 * A batch is limited by its size in bytes, and the limit counts 26 bytes of
 * overhead per event on top of the message. Counting it here is what makes the
 * simulator refuse the same batch an account would.
 */
export const simLogsEventOverheadBytes = 26;

/**
 * One log event held in a simulated log stream.
 */
export interface SimLogsStoredEvent {
  /**
   * The identifier `FilterLogEvents` reports for the event.
   *
   * Real CloudWatch Logs generates a long opaque number here. This one is a
   * zero-padded counter, unique within a simulation and increasing with
   * ingestion, which is everything a caller can rely on about the real one.
   */
  readonly eventId: string;

  /** When the event happened, as the caller reported it. */
  readonly timestamp: number;

  /** When CloudWatch Logs accepted it. */
  readonly ingestionTime: number;

  readonly message: string;
}

/**
 * The size a log event counts as against a batch limit.
 */
export function simLogsEventSizeBytes(message: string): number {
  return Buffer.byteLength(message, "utf8") + simLogsEventOverheadBytes;
}

/**
 * Order events the way CloudWatch Logs reads them back: oldest first, and
 * ingestion order between two events that carry the same timestamp.
 */
export function compareSimLogsEvents(
  left: SimLogsStoredEvent,
  right: SimLogsStoredEvent,
): number {
  return (
    left.timestamp - right.timestamp ||
    left.eventId.localeCompare(right.eventId)
  );
}
