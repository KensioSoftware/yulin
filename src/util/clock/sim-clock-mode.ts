import type { SimClock } from "./sim-clock.js";

/**
 * How a controllable clock relates simulated time to the clock underneath it.
 *
 * There are two ways to be in control of time, and they answer different
 * questions. A frozen clock is what a deterministic assertion wants: simulated
 * time only moves when something moves it, so a slow test never drifts. A
 * running clock offset from the one underneath is what "jump forward an hour and
 * carry on" wants: time still passes by itself, just somewhere else on the
 * timeline.
 *
 * Each mode knows how to become the other, so switching never loses the current
 * simulated instant.
 */
export interface SimClockMode {
  /**
   * Whether simulated time is standing still in this mode.
   */
  readonly isFrozen: boolean;

  /**
   * Get the simulated time this mode reports.
   */
  now(base: SimClock): Date;

  /**
   * Stop simulated time where it currently reads.
   */
  freeze(base: SimClock): SimClockMode;

  /**
   * Let simulated time run again from where it currently reads.
   */
  resume(base: SimClock): SimClockMode;
}

/**
 * Simulated time stopped at an instant, moving only when something moves it.
 */
export class SimFrozenClockMode implements SimClockMode {
  public readonly isFrozen = true;

  private readonly instant: Date;

  constructor(instant: Date) {
    this.instant = new Date(instant);
  }

  /**
   * Get the instant this mode is stopped at.
   */
  now(): Date {
    return new Date(this.instant);
  }

  /**
   * Stay stopped: freezing an already frozen clock changes nothing.
   */
  freeze(): SimClockMode {
    return this;
  }

  /**
   * Run again from the frozen instant, keeping it as the offset from the clock
   * underneath, so no simulated time is gained or lost by resuming.
   */
  resume(base: SimClock): SimClockMode {
    return new SimRunningClockMode(
      this.instant.getTime() - base.now().getTime(),
    );
  }
}

/**
 * Simulated time passing by itself, shifted from the clock underneath.
 */
export class SimRunningClockMode implements SimClockMode {
  public readonly isFrozen = false;

  private readonly offsetMs: number;

  constructor(offsetMs = 0) {
    this.offsetMs = offsetMs;
  }

  /**
   * Get the time the clock underneath reports, shifted by this offset.
   */
  now(base: SimClock): Date {
    return new Date(base.now().getTime() + this.offsetMs);
  }

  /**
   * Stop at whatever simulated time currently reads.
   */
  freeze(base: SimClock): SimClockMode {
    return new SimFrozenClockMode(this.now(base));
  }

  /**
   * Keep running: resuming an already running clock changes nothing.
   */
  resume(): SimClockMode {
    return this;
  }
}
