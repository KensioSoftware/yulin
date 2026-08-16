import {
  compareSimLogsEvents,
  simLogsEventSizeBytes,
  type SimLogsStoredEvent,
} from "../event/sim-logs-event.js";

interface SimLogsLogStreamProperties {
  readonly logStreamName: string;
  readonly arn: string;
  readonly creationTime: number;
}

/**
 * One log stream inside a simulated log group.
 *
 * Events are held in the order they arrived and read back oldest first. Real
 * CloudWatch Logs only requires a single batch to be in ascending order, so a
 * later batch may carry older events than one already accepted, and reading is
 * where the two are put back in order.
 */
export class SimLogsLogStream {
  readonly logStreamName: string;
  readonly arn: string;
  readonly creationTime: number;

  readonly #events: SimLogsStoredEvent[] = [];
  #lastIngestionTime: number | undefined;
  #acceptedBatches = 0;

  constructor(properties: SimLogsLogStreamProperties) {
    this.logStreamName = properties.logStreamName;
    this.arn = properties.arn;
    this.creationTime = properties.creationTime;
  }

  /**
   * Every event on this stream, oldest first.
   */
  get events(): readonly SimLogsStoredEvent[] {
    return [...this.#events].sort(compareSimLogsEvents);
  }

  /**
   * How many bytes of log data this stream holds.
   */
  get storedBytes(): number {
    return this.#events.reduce(
      (total, event) => total + simLogsEventSizeBytes(event.message),
      0,
    );
  }

  /**
   * The timestamp of the oldest event, or undefined on a stream nothing has
   * been written to.
   */
  get firstEventTimestamp(): number | undefined {
    return this.events.at(0)?.timestamp;
  }

  /**
   * The timestamp of the newest event.
   */
  get lastEventTimestamp(): number | undefined {
    return this.events.at(-1)?.timestamp;
  }

  /**
   * When this stream last accepted a batch.
   */
  get lastIngestionTime(): number | undefined {
    return this.#lastIngestionTime;
  }

  /**
   * The token a caller would send with its next batch.
   *
   * Real CloudWatch Logs stopped requiring the sequence token in 2023 and
   * ignores whatever a caller sends, so this is only here to be reported: a
   * caller that still chains one batch to the next gets a token back to chain
   * with. It is undefined until the stream has taken a batch, as the real one
   * is.
   */
  get uploadSequenceToken(): string | undefined {
    return this.#acceptedBatches === 0
      ? undefined
      : String(this.#acceptedBatches).padStart(20, "0");
  }

  /**
   * Take a batch of events onto this stream.
   */
  append(events: readonly SimLogsStoredEvent[], ingestionTime: number): void {
    if (events.length === 0) {
      return;
    }

    this.#events.push(...events);
    this.#lastIngestionTime = ingestionTime;
    this.#acceptedBatches += 1;
  }
}
