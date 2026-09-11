import { SimScheduleExpressionError } from "./sim-schedule.error.js";

/**
 * The wall-clock reading of one instant, as a schedule expression names it.
 */
export interface SimScheduleZoneParts {
  readonly year: number;

  /** The month as a JavaScript `Date` numbers it, January being zero. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;

  /** The day of the week, Sunday being zero. */
  readonly weekday: number;
}

const weekdays: readonly string[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

/**
 * The zone a schedule expression is read in.
 *
 * A cron expression names wall-clock fields, and which instants those are
 * depends on the zone the schedule was created with. Everything a schedule does
 * with a calendar therefore goes through one of these, and a schedule created
 * without a timezone gets the UTC one, which is what every schedule used to
 * get.
 *
 * `Intl.DateTimeFormat` is what knows the offsets, including the two days a
 * year a zone changes one, so no timezone database travels with this.
 */
export class SimScheduleZone {
  /**
   * The zone name as the request wrote it, which a describe reports back.
   */
  public readonly name: string;

  private readonly format: Intl.DateTimeFormat;

  private constructor(name: string, format: Intl.DateTimeFormat) {
    this.name = name;
    this.format = format;
  }

  /**
   * The zone a name calls for, refusing a name no zone answers to.
   */
  static of(name = "UTC"): SimScheduleZone {
    try {
      return new this(
        name,
        new Intl.DateTimeFormat("en-US", {
          timeZone: name,
          hourCycle: "h23",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          weekday: "short",
        }),
      );
    } catch {
      throw new SimScheduleExpressionError(
        `'${name}' is not a timezone. A timezone is an IANA name such as ` +
          `'Europe/London', or 'UTC'`,
      );
    }
  }

  /**
   * What a clock in this zone reads at an instant.
   */
  partsAt(instant: number): SimScheduleZoneParts {
    const read = this.read(instant);

    return {
      year: read.year,
      month: read.month - 1,
      day: read.day,
      hour: read.hour,
      minute: read.minute,
      weekday: read.weekday,
    };
  }

  /**
   * The instant a clock in this zone reads a wall-clock time at.
   *
   * The offset is read at a first guess and then at the instant that guess
   * gives, which is what carries a time across the day a zone changes offset. A
   * wall-clock time the zone skips over lands on the instant the clocks went
   * forward, and one it reads twice lands on the first of the two.
   */
  instantOf(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
  ): number {
    const wanted = Date.UTC(year, month, day, hour, minute);
    const guessed = wanted - this.offsetAt(wanted);

    return wanted - this.offsetAt(guessed);
  }

  /**
   * How far ahead of UTC this zone is at an instant, in milliseconds.
   */
  private offsetAt(instant: number): number {
    const read = this.read(instant);

    return (
      Date.UTC(read.year, read.month - 1, read.day, read.hour, read.minute) -
      Math.floor(instant / 60_000) * 60_000
    );
  }

  /**
   * One instant taken apart, in the numbering the formatter reports.
   */
  private read(instant: number): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    weekday: number;
  } {
    const parts = new Map(
      this.format
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value]),
    );

    return {
      year: Number(parts.get("year")),
      month: Number(parts.get("month")),
      day: Number(parts.get("day")),
      // Midnight reads as 24 under some locales rather than as zero.
      hour: Number(parts.get("hour")) % 24,
      minute: Number(parts.get("minute")),
      weekday: weekdays.indexOf(parts.get("weekday") ?? ""),
    };
  }
}
