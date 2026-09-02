import { clearTimeout, setTimeout } from "node:timers";
import type {
  BackgroundScheduler,
  BackgroundTask,
} from "../../../../../util/background/background.js";
import { simLambdaTimerDelay } from "./sim-lambda-timer-delay.js";

/** The longest delay a host timer takes before it fires straight away. */
const longestHostDelayMilliseconds = 2_147_483_647;

interface SimLambdaClockTimerProperties {
  readonly background: BackgroundScheduler;

  /** What happens once simulated time reaches this timer's instant. */
  readonly run: () => void;
}

/**
 * One thing that happens when a simulation's clock reaches an instant.
 *
 * The instant is what decides, and simulated time can arrive at it two ways. A
 * test that moves the clock brings it there at once, which is what the
 * scheduler's own clock-waiting queue is for. A simulation left running keeps
 * time with the host, and nothing dispatches that queue, so the timer also
 * keeps a host timer of its own and asks the clock again when it fires. A
 * clock that has not got there yet is asked again later, which is what makes a
 * frozen clock hold a timer indefinitely without spinning on it.
 *
 * The host timer is unreferenced, so a simulation nobody is driving never
 * holds the process open.
 */
export class SimLambdaClockTimer {
  readonly #background: BackgroundScheduler;
  readonly #run: () => void;
  readonly #task: BackgroundTask = (): Promise<void> => {
    this.#dispatch();

    return Promise.resolve();
  };

  #dueTime: Date;
  #delay = 0;
  #hostTimer: NodeJS.Timeout | undefined;

  constructor(properties: SimLambdaClockTimerProperties) {
    this.#background = properties.background;
    this.#run = properties.run;
    this.#dueTime = properties.background.now();
  }

  /**
   * Wait a delay of simulated time, and answer with how long that turned out
   * to be. A delay of nothing leaves the timer due where the clock already
   * reads, which is not waiting on the clock at all.
   */
  startIn(delay: number | undefined): number {
    this.#delay = simLambdaTimerDelay(delay);
    this.startAt(new Date(this.#background.now().getTime() + this.#delay));

    return this.#delay;
  }

  /**
   * Wait the same delay again, measured from the instant this timer was last
   * due rather than from the time its work ran, so an advance covering several
   * periods runs the work once for each of them.
   */
  again(): void {
    this.startAt(new Date(this.#dueTime.getTime() + this.#delay));
  }

  /**
   * Wait for simulated time to reach an instant, giving up whatever this timer
   * was waiting for before.
   */
  startAt(dueTime: Date): void {
    this.cancel();
    this.#dueTime = dueTime;
    this.#background.scheduleAt(dueTime, this.#task);
    this.#armHostTimer();
  }

  /**
   * Give up on this timer, on both timelines.
   */
  cancel(): void {
    this.#background.cancelScheduled(this.#task);
    clearTimeout(this.#hostTimer);
    this.#hostTimer = undefined;
  }

  /**
   * Run this timer's work, on whichever timeline got there first.
   *
   * Taking it off both timelines first is what makes it happen once, and what
   * leaves work that starts this timer again beginning from nothing rather
   * than from a turn already queued.
   */
  #dispatch(): void {
    this.cancel();
    this.#run();
  }

  /**
   * Ask the clock again when the host gets to the delay this timer has left.
   */
  #armHostTimer(): void {
    this.#hostTimer = setTimeout(() => {
      this.#hostTimer = undefined;

      if (this.#dueTime.getTime() <= this.#background.now().getTime()) {
        this.#dispatch();

        return;
      }

      this.#armHostTimer();
    }, this.#remainingHostDelay());
    this.#hostTimer.unref();
  }

  /**
   * How long the host should wait before asking the clock again, kept inside
   * what a host timer can hold: a longer one fires at once, and a timer that
   * fired at once and found nothing due would spin.
   */
  #remainingHostDelay(): number {
    const remaining =
      this.#dueTime.getTime() - this.#background.now().getTime();

    return Math.min(Math.max(remaining, 0), longestHostDelayMilliseconds);
  }
}
