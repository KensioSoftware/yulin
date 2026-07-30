import type {
  BackgroundScheduler,
  BackgroundTask,
} from "../../../../util/background/background.js";

const millisecondsPerSecond = 1000;

interface SimLambdaEventSourcePollScheduleProperties {
  readonly background: BackgroundScheduler;
  readonly poll: BackgroundTask;
}

/**
 * When one event source mapping polls next.
 *
 * Real Lambda polls its queue continuously, and nothing in this simulation runs
 * continuously, so every poll is scheduled in response to something: a message
 * arriving, a batch coming back, or a batch that filled the request suggesting
 * there is more waiting.
 */
export class SimLambdaEventSourcePollSchedule {
  private readonly background: BackgroundScheduler;
  private readonly poll: BackgroundTask;

  private scheduled = false;

  constructor(properties: SimLambdaEventSourcePollScheduleProperties) {
    this.background = properties.background;
    this.poll = properties.poll;
  }

  /**
   * Poll as soon as the simulation gets to it, unless a poll is already
   * waiting to happen.
   */
  now(): void {
    if (this.scheduled) {
      return;
    }

    this.scheduled = true;
    this.background.schedule(async () => {
      this.scheduled = false;

      await this.poll();
    });
  }

  /**
   * Poll when a message becomes receivable, which is now for an ordinary send
   * and later for one sent with a delay.
   */
  at(instant: Date): void {
    if (instant.getTime() <= this.background.now().getTime()) {
      this.now();

      return;
    }

    this.background.scheduleAt(instant, this.poll);
  }

  /**
   * Poll again once a visibility timeout has run, which is an instant on the
   * simulation's clock rather than something that fires.
   *
   * Advancing time is what brings a returned batch back, so this is scheduled
   * on the clock even for a timeout of zero. A poll that ran straight back
   * round would spin on a batch the function keeps failing.
   */
  afterSeconds(seconds: number): void {
    this.background.scheduleAt(
      new Date(
        this.background.now().getTime() + seconds * millisecondsPerSecond,
      ),
      this.poll,
    );
  }
}
