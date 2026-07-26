/**
 * A length of time, written the way a test wants to say it.
 *
 * Every component is optional and they add together, so `{ hours: 1, minutes: 30 }`
 * is ninety minutes. This is the literal a caller writes; SimDuration is what the
 * simulator works with.
 */
export interface SimDurationInput {
  readonly days?: number;
  readonly hours?: number;
  readonly minutes?: number;
  readonly seconds?: number;
  readonly milliseconds?: number;
}

const millisecondsPerSecond = 1000;
const millisecondsPerMinute = 60 * millisecondsPerSecond;
const millisecondsPerHour = 60 * millisecondsPerMinute;
const millisecondsPerDay = 24 * millisecondsPerHour;

/**
 * Thrown for a duration that cannot describe an amount of elapsed time.
 */
export class SimInvalidDuration extends Error {
  constructor(component: keyof SimDurationInput, value: number) {
    super(
      `Invalid simulated duration: ${component} must be a finite number of zero or more, got ${String(value)}`,
    );
    this.name = "SimInvalidDuration";
  }
}

/**
 * Measure one component of a duration, refusing anything that cannot describe
 * an amount of elapsed time.
 */
function componentMilliseconds(
  component: keyof SimDurationInput,
  value: number | undefined,
  perUnit: number,
): number {
  const amount = value ?? 0;

  if (!Number.isFinite(amount) || amount < 0) {
    throw new SimInvalidDuration(component, amount);
  }

  return amount * perUnit;
}

/**
 * Add up the components of a duration.
 */
function totalMilliseconds(duration: SimDurationInput): number {
  return (
    componentMilliseconds("days", duration.days, millisecondsPerDay) +
    componentMilliseconds("hours", duration.hours, millisecondsPerHour) +
    componentMilliseconds("minutes", duration.minutes, millisecondsPerMinute) +
    componentMilliseconds("seconds", duration.seconds, millisecondsPerSecond) +
    componentMilliseconds("milliseconds", duration.milliseconds, 1)
  );
}

/**
 * An amount of elapsed simulated time.
 *
 * Durations are never negative. Time passing is a forward-only idea, and a
 * simulation that wants to be at an earlier instant sets its clock to that
 * instant rather than advancing by a negative amount.
 */
export class SimDuration {
  private readonly milliseconds: number;

  private constructor(milliseconds: number) {
    this.milliseconds = milliseconds;
  }

  /**
   * Build a duration from the components a caller wrote, or pass one through.
   */
  static of(duration: SimDuration | SimDurationInput): SimDuration {
    if (duration instanceof this) {
      return duration;
    }

    return new this(totalMilliseconds(duration));
  }

  /**
   * Build a duration from a plain number of milliseconds.
   */
  static ofMilliseconds(milliseconds: number): SimDuration {
    return this.of({ milliseconds });
  }

  /**
   * Get this duration as a number of milliseconds, for Date arithmetic.
   */
  toMilliseconds(): number {
    return this.milliseconds;
  }
}
