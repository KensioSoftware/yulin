import { SimScheduleExpressionError } from "../sim-schedule.error.js";

/**
 * The instant an `at()` expression names, written without a timezone.
 *
 * AWS takes `at(yyyy-mm-ddThh:mm:ss)` and no other form: no fractional seconds,
 * no trailing `Z`, and no offset. The timezone is a separate setting on the
 * schedule rather than part of the expression, which is why one written here
 * would be ambiguous rather than helpful.
 */
const atInstant =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})$/u;

/**
 * One `at()` expression: a single instant, and never another.
 *
 * This is what makes a one-time schedule one-time. There is no interval and no
 * pattern to step through, so the second time it is asked what comes next, the
 * answer is nothing, and whatever is arming it stops arming it.
 */
export class SimAtExpression {
  public readonly source: string;

  private readonly at: Date;

  private constructor(source: string, at: Date) {
    this.source = source;
    this.at = at;
  }

  /**
   * Read the instant inside an `at(...)`.
   */
  static of(source: string): SimAtExpression {
    const read = atInstant.exec(source.trim())?.groups;

    if (read === undefined) {
      throw new SimScheduleExpressionError(
        `an at expression is an instant written 'yyyy-mm-ddThh:mm:ss', with ` +
          `no timezone on it, and this one is '${source}'`,
      );
    }

    const written = source.trim();
    const { year, month, day, hour, minute, second } = read;
    const at = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
    );

    // JavaScript rolls an impossible date over rather than refusing it, so the
    // thirtieth of February quietly becomes the second of March and half past
    // twenty-five becomes tomorrow morning. Writing the instant back out is
    // what catches every one of those in one comparison.
    if (!at.toISOString().startsWith(written)) {
      throw new SimScheduleExpressionError(
        `an at expression names a real instant, and '${source}' is not one`,
      );
    }

    return new this(source, at);
  }

  /**
   * The instant this expression names, once, and nothing after that.
   *
   * An instant already past is nothing rather than something overdue. Real
   * Scheduler does not invoke a one-time schedule created for a time that has
   * already gone, and a simulation that fired it the moment the clock moved
   * would invent an invocation AWS never makes.
   */
  nextAfter(instant: Date): Date | undefined {
    if (this.at.getTime() <= instant.getTime()) {
      return undefined;
    }

    return new Date(this.at);
  }
}
