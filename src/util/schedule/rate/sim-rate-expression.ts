import { SimScheduleExpressionError } from "../sim-schedule.error.js";

const millisecondsPerMinute = 60_000;

const wholeNumber = /^\d+$/u;

const whitespace = /\s+/u;

/**
 * How long each unit a rate expression takes is, in minutes.
 *
 * Seconds are absent because AWS has none: the finest schedule it runs is one a
 * minute, so a rate under that has no unit to be written in.
 */
const unitMinutes: ReadonlyMap<string, number> = new Map([
  ["minute", 1],
  ["hour", 60],
  ["day", 24 * 60],
]);

/**
 * The unit a rate is in, without its plural.
 */
function readUnit(written: string): { singular: string; minutes: number } {
  const singular = written.toLowerCase().replace(/s$/u, "");
  const minutes = unitMinutes.get(singular);

  if (minutes === undefined) {
    throw new SimScheduleExpressionError(
      `a rate is in minutes, hours or days, and this one is in ` +
        `'${written}'. AWS runs no schedule finer than one a minute, so ` +
        `there is no smaller unit to ask for.`,
    );
  }

  return { singular, minutes };
}

/**
 * The number of units a rate is, which has to be a whole one or more.
 */
function readValue(written: string): number {
  if (!wholeNumber.test(written) || Number(written) < 1) {
    throw new SimScheduleExpressionError(
      `a rate is a positive whole number of units, and this one is ` +
        `'${written}'`,
    );
  }

  return Number(written);
}

/**
 * Refuse a value and unit that do not agree, as AWS does.
 *
 * `rate(1 hours)` and `rate(5 hour)` are both refused by real EventBridge, and
 * both are the kind of thing that is written by accident, so refusing them here
 * is what stops a rule failing to deploy after the tests passed.
 */
function refuseDisagreement(
  value: number,
  written: string,
  singular: string,
): void {
  const expected = value === 1 ? singular : `${singular}s`;

  if (written.toLowerCase() !== expected) {
    throw new SimScheduleExpressionError(
      `a rate of ${String(value)} is written '${String(value)} ${expected}', ` +
        `not '${String(value)} ${written}'`,
    );
  }
}

/**
 * One rate expression, as an interval between occurrences.
 *
 * A rate runs from whenever the thing carrying it was created rather than from
 * a wall clock boundary, so this holds only how long the interval is. Where the
 * interval is counted from is the caller's, which is what makes a `rate(1 day)`
 * rule created at half past nine fire at half past nine.
 */
export class SimRateExpression {
  public readonly source: string;

  private readonly interval: number;

  private constructor(source: string, interval: number) {
    this.source = source;
    this.interval = interval;
  }

  /**
   * Read the value and unit inside a `rate(...)`.
   */
  static of(source: string, requireAgreement: boolean): SimRateExpression {
    const [value, unit, ...extra] = source.trim().split(whitespace);

    if (value === undefined || unit === undefined || extra.length > 0) {
      throw new SimScheduleExpressionError(
        `a rate expression is a value and a unit separated by a space, such ` +
          `as '5 minutes', and this one is '${source}'`,
      );
    }

    const count = readValue(value);
    const read = readUnit(unit);

    if (requireAgreement) {
      refuseDisagreement(count, unit, read.singular);
    }

    return new this(source, count * read.minutes * millisecondsPerMinute);
  }

  /**
   * The next instant this rate falls due after an instant.
   *
   * One interval on from whatever it is asked about, so asking it about each
   * due time in turn walks the schedule from where it started.
   */
  nextAfter(instant: Date): Date {
    return new Date(instant.getTime() + this.interval);
  }
}
