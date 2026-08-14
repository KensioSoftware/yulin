import { SimScheduleExpressionError } from "../sim-schedule.error.js";
import type { SimCronFieldSpec } from "./sim-cron-field-spec.js";
import { readFields, type SimCronFields } from "./sim-cron-fields.js";

const millisecondsPerMinute = 60_000;

const whitespace = /\s+/u;

/**
 * The instant the minute after an instant starts.
 *
 * A cron expression names minutes, so a search for the next occurrence starts
 * at the next whole minute. It is strictly after, so a rule due exactly now
 * does not come back as due again.
 */
function startOfNextMinute(instant: Date): number {
  return (
    Math.floor(instant.getTime() / millisecondsPerMinute) *
      millisecondsPerMinute +
    millisecondsPerMinute
  );
}

/**
 * One cron expression, read into the instants it falls due at.
 *
 * Everything is read in UTC. AWS runs scheduled rules in UTC and offers a
 * timezone as a separate setting, so a local timezone never enters into this.
 */
export class SimCronExpression {
  public readonly source: string;

  private readonly fields: SimCronFields;

  private constructor(source: string, fields: SimCronFields) {
    this.source = source;
    this.fields = fields;
  }

  /**
   * Read a cron expression against a dialect's fields.
   *
   * The fields are positional, so an expression with the wrong number of them
   * is refused naming the form expected rather than read as though the missing
   * one were at the end.
   */
  static of(
    specs: readonly SimCronFieldSpec[],
    source: string,
  ): SimCronExpression {
    const written = source.trim().split(whitespace);

    if (written.length !== specs.length) {
      throw new SimScheduleExpressionError(
        `a cron expression has ${String(specs.length)} fields separated by ` +
          `spaces, ${specs.map((spec) => spec.name).join(" ")}, and this one ` +
          `has ${String(written.length)}`,
      );
    }

    return new this(source, readFields(specs, written));
  }

  /**
   * The next instant this expression falls due after an instant.
   *
   * Nothing comes back once the search has run past the last year the dialect
   * has, since a cron expression naming only years in the past falls due never.
   */
  nextAfter(instant: Date): Date | undefined {
    const end = Date.UTC(this.fields.year.maximum + 1, 0, 1);
    let candidate = startOfNextMinute(instant);

    while (candidate < end) {
      const skipTo = this.skipUnmatched(candidate);

      if (skipTo === undefined) {
        return new Date(candidate);
      }

      candidate = skipTo;
    }

    return undefined;
  }

  /**
   * Where to look next when an instant is not one this expression names, or
   * nothing when it is.
   *
   * A field that does not match skips the whole of the unit below it: a month
   * that does not match moves to the first of the next month rather than trying
   * every minute of it. That is what keeps a search over years to a few hundred
   * steps rather than the million minutes they hold.
   */
  private skipUnmatched(at: number): number | undefined {
    const date = new Date(at);
    const year = date.getUTCFullYear();

    if (!this.fields.year.allows(year)) {
      return Date.UTC(year + 1, 0, 1);
    }

    const month = date.getUTCMonth();

    if (!this.fields.month.allows(month + 1)) {
      return Date.UTC(year, month + 1, 1);
    }

    const day = date.getUTCDate();

    if (!this.allowsDay(date)) {
      return Date.UTC(year, month, day + 1);
    }

    const hour = date.getUTCHours();

    if (!this.fields.hours.allows(hour)) {
      return Date.UTC(year, month, day, hour + 1);
    }

    if (!this.fields.minutes.allows(date.getUTCMinutes())) {
      return at + millisecondsPerMinute;
    }

    return undefined;
  }

  /**
   * Whether this expression names a day.
   *
   * Whichever of the two day fields is not `?` is the one that decides, which
   * is why they cannot both say something.
   */
  private allowsDay(date: Date): boolean {
    if (this.fields.dayOfMonth.isAny) {
      // AWS numbers the week from Sunday as one, and JavaScript from Sunday as
      // zero.
      return this.fields.dayOfWeek.allows(date.getUTCDay() + 1);
    }

    return this.fields.dayOfMonth.allows(date.getUTCDate());
  }
}
