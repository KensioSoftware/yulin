import type {
  BackgroundCompleter,
  BackgroundDueTaskSource,
  BackgroundScheduler,
} from "../background/background.js";
import type { SimClock } from "./sim-clock.js";
import type { SimControllableClock } from "./sim-controllable-clock.js";
import { SimDuration, type SimDurationInput } from "./sim-duration.js";

/**
 * The scheduler a clock control moves time for: it releases work waiting on the
 * clock, and it can be waited on until the simulation settles.
 */
export type SimClockControlBackground = BackgroundScheduler &
  BackgroundCompleter &
  BackgroundDueTaskSource;

interface SimClockControlProperties {
  readonly clock: SimControllableClock;
  readonly background: SimClockControlBackground;
}

/**
 * Control over one simulation's sense of time.
 *
 * Moving the clock is only half of what a test needs. The other half is that
 * whatever the passage of time should have caused has actually happened by the
 * time the call returns, so the next line can assert rather than wait. So this
 * class owns both the clock and the scheduler: advancing walks simulated time
 * forward through everything that falls due in the interval, running each task
 * at its own due time, and returns once nothing is left pending.
 *
 * Control is per simulation. Moving time here never touches another simulation
 * or the real clock, which is what keeps a SimAws instance safe to construct
 * per test case.
 */
export class SimClockControl implements SimClock {
  private readonly clock: SimControllableClock;
  private readonly background: SimClockControlBackground;

  constructor(properties: SimClockControlProperties) {
    this.clock = properties.clock;
    this.background = properties.background;
  }

  /**
   * Get the current simulated time.
   */
  now(): Date {
    return this.clock.now();
  }

  /**
   * Whether simulated time is currently standing still.
   */
  get isFrozen(): boolean {
    return this.clock.isFrozen;
  }

  /**
   * Stop simulated time where it currently reads.
   *
   * A frozen clock reports the same instant however long the host takes, so a
   * slow test cannot drift past the state it set up.
   */
  freeze(): void {
    this.clock.freeze();
  }

  /**
   * Let simulated time pass by itself again, carrying on from where it stopped.
   *
   * Time then runs at real speed, offset by however far it has been moved, so
   * "jump forward an hour and carry on" behaves as it sounds.
   */
  resume(): void {
    this.clock.resume();
  }

  /**
   * Set simulated time to an instant, running whatever falls due on the way.
   *
   * Setting time backwards runs nothing: it simply moves the clock, and work
   * already scheduled waits for time to reach it again.
   *
   * Work that fails throws from here, leaving the clock at the failed task's
   * due time rather than at the instant asked for. Simulated time got that far
   * and then something broke, and saying so is more use than claiming the whole
   * interval elapsed. Whatever was still queued stays queued.
   *
   * The clock freezes where it reads before any of that happens. Simulated time
   * then moves only where this method moves it, and a task scheduling its own
   * follow-up measures the delay from a still instant.
   */
  async setTo(instant: Date): Promise<void> {
    this.clock.freeze();

    if (instant.getTime() >= this.now().getTime()) {
      await this.runDueTasksUpTo(instant);
    }

    this.clock.setTo(instant);

    await this.background.complete();
  }

  /**
   * Move simulated time forward by a duration, running whatever falls due.
   *
   * Returns once the simulation has settled, so a test can advance and then
   * assert without waiting again.
   *
   * The duration is measured from a frozen instant. Advancing by exactly a
   * buffering interval or a schedule period lands on the due instant every
   * time, whatever the host clock does while the advance runs.
   */
  async advanceBy(duration: SimDuration | SimDurationInput): Promise<void> {
    this.clock.freeze();

    const milliseconds = SimDuration.of(duration).toMilliseconds();

    await this.setTo(new Date(this.now().getTime() + milliseconds));
  }

  /**
   * Dispatch everything due at or before an instant, in due order.
   *
   * Each task runs with the clock reading its own due time rather than the
   * final one, so a task that stamps a timestamp records when it happened. Work
   * a task schedules for itself settles before the next due task is taken,
   * which keeps cascading work in order too.
   *
   * The loop runs as long as work keeps falling due inside the interval, as
   * draining does generally: a task that endlessly reschedules itself inside
   * the interval is asking for endless work, and cutting it off part way would
   * report a settled simulation that is nothing of the kind.
   *
   * Each due task is run here rather than handed to the scheduler's `schedule`.
   * That defers by a real timer, and Node holds a zero millisecond `setTimeout`
   * for about a millisecond. Every instant the interval steps through would
   * then cost a millisecond of host time, and thirty simulated days over an
   * alarm evaluating every five minutes steps through 8,640 of them. The timer
   * buys nothing here, because the loop waits for each task to finish before it
   * takes the next one.
   */
  private async runDueTasksUpTo(instant: Date): Promise<void> {
    let due = this.background.takeNextDueBy(instant);

    while (due !== undefined) {
      this.clock.setTo(this.laterOfNow(due.dueTime));

      // oxlint-disable-next-line no-await-in-loop
      await due.task();

      // oxlint-disable-next-line no-await-in-loop
      await this.background.complete();

      due = this.background.takeNextDueBy(instant);
    }
  }

  /**
   * Keep the clock moving forward: an overdue task runs at the current time
   * rather than dragging simulated time backwards to when it should have run.
   */
  private laterOfNow(instant: Date): Date {
    const now = this.now();

    if (instant.getTime() < now.getTime()) {
      return now;
    }

    return instant;
  }
}
