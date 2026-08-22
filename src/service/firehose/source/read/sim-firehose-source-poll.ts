import type {
  BackgroundScheduler,
  BackgroundTask,
} from "../../../../util/background/background.js";

interface SimFirehoseSourcePollProperties {
  readonly background: BackgroundScheduler;
  readonly read: BackgroundTask;
}

/**
 * When one delivery stream reads its source stream next.
 *
 * The read is scheduled on the clock, for the instant the simulation currently
 * reads. Advancing time is then what moves records from the stream into the
 * buffer, and the same advance can carry that buffer past its interval. A read
 * scheduled off the clock would happen after the advance instead, leaving a
 * test to advance twice for one record.
 *
 * A read already waiting to happen is left alone. A stream taking a record a
 * second would otherwise queue a read for each of them, and the first would
 * have read them all.
 */
export class SimFirehoseSourcePoll {
  private readonly background: BackgroundScheduler;
  private readonly task: BackgroundTask;

  private scheduled = false;
  private stopped = false;

  constructor(properties: SimFirehoseSourcePollProperties) {
    this.background = properties.background;
    this.task = async (): Promise<void> => {
      this.scheduled = false;

      await properties.read();
    };
  }

  /**
   * Read once simulated time next moves.
   */
  soon(): void {
    if (this.stopped || this.scheduled) {
      return;
    }

    this.scheduled = true;
    this.background.scheduleAt(this.background.now(), this.task);
  }

  /**
   * Give up whatever read was waiting on the clock, and take no more.
   *
   * Both halves matter. A read already queued would otherwise wait for a
   * delivery stream that has gone, and a delivery stream that stopped part way
   * through a read goes on to ask for another.
   */
  stop(): void {
    this.stopped = true;
    this.background.cancelScheduled(this.task);
  }
}
