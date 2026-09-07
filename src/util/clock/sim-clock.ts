/**
 * Source of the current time inside one simulated environment.
 *
 * Every simulated timestamp comes from a clock rather than a direct `new Date()`,
 * so a simulation's sense of time belongs to its own SimAws instance rather than
 * to the process running it. That keeps instances independent: controlling time
 * in one simulation cannot disturb another, or the real clock.
 */
export interface SimClock {
  /**
   * Get the current time in this simulation.
   */
  now(): Date;

  /**
   * Whether simulated time moves on this clock by itself.
   *
   * A scheduler reads this to decide what waiting for a simulation to settle
   * means. Time that advances brings the instant a task is scheduled for on
   * its own, and settling waits for that task. Time that stands still leaves
   * the instant to whoever moves the clock, and settling leaves the task where
   * it is.
   *
   * A clock that says nothing advances, as the host clock does.
   */
  readonly advances?: boolean;
}

/**
 * Clock that reports the real system time.
 *
 * This is the default, so a simulation runs in step with the host clock until
 * something deliberately replaces it.
 */
export class SimRealClock implements SimClock {
  /** Real time moves by itself. */
  public readonly advances = true;

  /**
   * Get the current real system time.
   */
  now(): Date {
    return new Date();
  }
}

/**
 * Clock stopped at a fixed instant.
 *
 * Useful wherever a test wants timestamps it can assert on exactly, without
 * reaching for a library that replaces the clock for the whole process.
 */
export class SimFixedClock implements SimClock {
  /** A fixed instant is the whole of this clock. Time stands still on it. */
  public readonly advances = false;

  private readonly instant: Date;

  constructor(instant: Date) {
    this.instant = new Date(instant);
  }

  /**
   * Get the fixed instant this clock reports.
   */
  now(): Date {
    return new Date(this.instant);
  }
}
