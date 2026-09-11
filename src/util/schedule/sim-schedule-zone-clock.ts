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
 * Reads what a clock in one zone says at an instant.
 */
export type SimScheduleZoneClock = (instant: number) => SimScheduleZoneParts;

/**
 * A clock for one zone, refusing a name no zone answers to.
 *
 * `Intl.DateTimeFormat` is what knows the offsets, including the two days a
 * year a zone changes one, so no timezone database travels with this. Which
 * names there are is therefore the host's own, and a name it has never heard
 * of is refused here.
 */
export function simScheduleZoneClock(name: string): SimScheduleZoneClock {
  const format = zoneFormat(name);

  return (instant: number): SimScheduleZoneParts => {
    const parts = new Map(
      format
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value]),
    );

    return {
      year: Number(parts.get("year")),
      month: Number(parts.get("month")) - 1,
      day: Number(parts.get("day")),
      // Midnight reads as 24 under some locales rather than as zero.
      hour: Number(parts.get("hour")) % 24,
      minute: Number(parts.get("minute")),
      weekday: weekdays.indexOf(parts.get("weekday") ?? ""),
    };
  };
}

/**
 * The formatter for a zone, which is also what decides the name is one.
 */
function zoneFormat(name: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: name,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
  } catch {
    throw new SimScheduleExpressionError(
      `'${name}' is not a timezone. A timezone is an IANA name such as ` +
        `'Europe/London', or 'UTC'`,
    );
  }
}
