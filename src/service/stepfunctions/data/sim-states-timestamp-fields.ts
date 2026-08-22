const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const februaryInALeapYear = 29;

/**
 * Whether the fields a timestamp was written with name a real instant.
 *
 * A pattern can only say how many digits each field has. JavaScript's own
 * parser rolls a day past the end of its month into the next one, so
 * `2026-02-30T00:00:00Z` would otherwise be read as the second of March, and
 * `2024-02-29T24:00:00Z` as midnight the next day.
 */
export function simStatesTimestampFieldsHold(
  fields: readonly (string | undefined)[],
): boolean {
  const [
    year = 0,
    month = 0,
    day = 0,
    hour = 0,
    minute = 0,
    second = 0,
    offsetHour = 0,
    offsetMinute = 0,
  ] = fields.map(readField);

  return (
    isWithin(month, 1, 12) &&
    isWithin(day, 1, daysInMonth(year, month)) &&
    isWithin(hour, 0, 23) &&
    isWithin(minute, 0, 59) &&
    isWithin(second, 0, 59) &&
    isWithin(offsetHour, 0, 23) &&
    isWithin(offsetMinute, 0, 59)
  );
}

/**
 * Read one field, taking one the timestamp left out as a zero.
 *
 * A timestamp written in UTC carries no offset, and no offset is no hours and
 * no minutes away from it.
 */
function readField(written: string | undefined): number {
  return Number(written ?? 0);
}

function isWithin(value: number, least: number, most: number): boolean {
  return value >= least && value <= most;
}

/**
 * How many days a month has, counting the leap day where the year has one.
 */
function daysInMonth(year: number, month: number): number {
  if (month === 2 && isALeapYear(year)) {
    return februaryInALeapYear;
  }

  return monthLengths.at(month - 1) ?? 0;
}

function isALeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
