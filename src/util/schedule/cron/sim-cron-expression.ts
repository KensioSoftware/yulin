import { SimScheduleExpressionError } from "../sim-schedule.error.js";
import type { SimScheduleZone } from "../sim-schedule-zone.js";
import type { SimScheduleZoneParts } from "../sim-schedule-zone-clock.js";
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
 * The fields name a wall-clock time, and the schedule's zone is what says which
 * instants those are. An EventBridge rule has no timezone setting and gets the
 * UTC zone, which reads exactly as the UTC calendar does.
 */
export class SimCronExpression {
  public readonly source: string;

  private readonly fields: SimCronFields;
  private readonly zone: SimScheduleZone;

  private constructor(
    source: string,
    fields: SimCronFields,
    zone: SimScheduleZone,
  ) {
    this.source = source;
    this.fields = fields;
    this.zone = zone;
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
    zone: SimScheduleZone,
  ): SimCronExpression {
    const written = source.trim().split(whitespace);

    if (written.length !== specs.length) {
      throw new SimScheduleExpressionError(
        `a cron expression has ${String(specs.length)} fields separated by ` +
          `spaces, ${specs.map((spec) => spec.name).join(" ")}, and this one ` +
          `has ${String(written.length)}`,
      );
    }

    return new this(source, readFields(specs, written), zone);
  }

  /**
   * The next instant this expression falls due after an instant.
   *
   * Nothing comes back once the search has run past the last year the dialect
   * has, since a cron expression naming only years in the past falls due never.
   */
  nextAfter(instant: Date): Date | undefined {
    const end = this.zone.instantOf(this.fields.year.maximum + 1, 0, 1);
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
    const read = this.zone.partsAt(at);
    const { year, month, day, hour } = read;

    if (!this.fields.year.allows(year)) {
      return this.zone.instantOf(year + 1, 0, 1);
    }

    if (!this.fields.month.allows(month + 1)) {
      return this.zone.instantOf(year, month + 1, 1);
    }

    if (!this.allowsDay(read)) {
      return this.zone.instantOf(year, month, day + 1);
    }

    if (!this.fields.hours.allows(hour)) {
      return this.zone.instantOf(year, month, day, hour + 1);
    }

    if (!this.fields.minutes.allows(read.minute)) {
      return at + millisecondsPerMinute;
    }

    // The second of a repeated hour reads the same wall clock as the first and
    // has already been answered with. Real Scheduler fires once when the clocks
    // go back, rather than twice.
    return this.zone.isCanonical(at) ? undefined : at + millisecondsPerMinute;
  }

  /**
   * Whether this expression names a day.
   *
   * Whichever of the two day fields is not `?` is the one that decides, which
   * is why they cannot both say something.
   */
  private allowsDay(read: SimScheduleZoneParts): boolean {
    if (this.fields.dayOfMonth.isAny) {
      // AWS numbers the week from Sunday as one, and JavaScript from Sunday as
      // zero.
      return this.fields.dayOfWeek.allows(read.weekday + 1);
    }

    return this.fields.dayOfMonth.allows(read.day);
  }
}
