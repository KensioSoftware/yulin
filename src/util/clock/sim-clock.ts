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
}

/**
 * Clock that reports the real system time.
 *
 * This is the default, so a simulation runs in step with the host clock until
 * something deliberately replaces it.
 */
export class SimRealClock implements SimClock {
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
