import { type SimClock, SimRealClock } from "./sim-clock.js";
import {
  SimFrozenClockMode,
  type SimClockMode,
  SimRunningClockMode,
} from "./sim-clock-mode.js";
import { SimDuration, type SimDurationInput } from "./sim-duration.js";

interface SimControllableClockProperties {
  /**
   * The clock this one is measured against, defaulting to the real system
   * clock. Freezing and offsetting are applied on top of it, so a simulation
   * given a clock of its own stays controllable.
   */
  readonly base?: SimClock | undefined;
}

/**
 * A clock whose time can be moved.
 *
 * This is what lets a test exercise behaviour that only happens once time
 * passes, without waiting for it and without replacing the clock for the whole
 * process. Control belongs to one clock instance, so moving time here cannot
 * disturb another simulation, or the real clock.
 *
 * Moving time deliberately freezes it. Having asked for a specific instant, a
 * test should get to assert on that instant rather than on that instant plus
 * however long the assertion took to run. `resume()` is the way back to time
 * passing by itself.
 */
export class SimControllableClock implements SimClock {
  private readonly base: SimClock;
  private mode: SimClockMode = new SimRunningClockMode();

  constructor(properties: SimControllableClockProperties = {}) {
    this.base = properties.base ?? new SimRealClock();
  }

  /**
   * Get the current simulated time.
   */
  now(): Date {
    return this.mode.now(this.base);
  }

  /**
   * Whether simulated time is currently standing still.
   */
  get isFrozen(): boolean {
    return this.mode.isFrozen;
  }

  /**
   * Stop simulated time where it currently reads.
   */
  freeze(): void {
    this.mode = this.mode.freeze(this.base);
  }

  /**
   * Let simulated time pass by itself again, carrying on from where it stopped
   * rather than snapping back to the clock underneath.
   */
  resume(): void {
    this.mode = this.mode.resume(this.base);
  }

  /**
   * Set simulated time to an instant, and stop there.
   */
  setTo(instant: Date): void {
    this.mode = new SimFrozenClockMode(instant);
  }

  /**
   * Move simulated time forward by a duration, and stop there.
   *
   * A bare number counts milliseconds, as it does for `setTimeout`.
   */
  advanceBy(duration: SimDuration | SimDurationInput | number): void {
    const milliseconds = SimDuration.of(duration).toMilliseconds();

    this.setTo(new Date(this.now().getTime() + milliseconds));
  }
}
