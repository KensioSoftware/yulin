// Both patterns below are anchored at each end with every quantifier bounded,
// so there is nothing in either to backtrack over.
// oxlint-disable security/detect-unsafe-regex

/**
 * The ISO-8601 shapes a table's timestamp column is written in.
 *
 * A date, or a date and a time joined by a `T` or a space, with up to three
 * fractional digits and an optional `Z`.
 *
 * Two shapes are deliberately left out. A value carrying a numeric UTC offset
 * would mean rendering the answer back into that offset, and a value written
 * finer than the millisecond has no room in the instant an answer is rendered
 * from. Refusing either is better than answering with a timestamp that has been
 * quietly cut about.
 */
const isoDate = /^\d{4}-\d{2}-\d{2}$/u;
const isoDateTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?$/u;

/**
 * A value with no zone on it reads as UTC.
 *
 * `Date.parse` reads a space separated timestamp in the host's own zone, which
 * would answer differently on two machines running the same test.
 */
function asUtc(text: string): string {
  const joined = text.replace(" ", "T");

  return joined.endsWith("Z") || joined.length <= 10 ? joined : `${joined}Z`;
}

/** The instant one ISO-8601 value names, or nothing where it names none. */
export function simAthenaInstant(text: string): number | undefined {
  if (!isoDate.test(text) && !isoDateTime.test(text)) {
    return undefined;
  }

  const parsed = Date.parse(asUtc(text));

  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Render an instant the way one value was written.
 *
 * The template says how long the answer is, where its separators go and whether
 * it carries a `Z`, so a date comes back a date and a timestamp comes back
 * carrying the same fields it arrived with.
 */
export function simAthenaRenderLike(instant: number, template: string): string {
  const iso = new Date(instant).toISOString();
  let rendered = "";

  for (let index = 0; index < template.length; index += 1) {
    const character = template.charAt(index);

    rendered += /\d/u.test(character) ? iso.charAt(index) : character;
  }

  return rendered;
}

/** The calendar fields one instant reads in UTC. */
export interface SimAthenaDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly time: number;
}

/** One instant taken apart, for the units a calendar counts rather than a clock. */
export function simAthenaDateParts(instant: number): SimAthenaDateParts {
  const at = new Date(instant);

  return {
    year: at.getUTCFullYear(),
    month: at.getUTCMonth(),
    day: at.getUTCDate(),
    time:
      at.getUTCHours() * 3_600_000 +
      at.getUTCMinutes() * 60_000 +
      at.getUTCSeconds() * 1000 +
      at.getUTCMilliseconds(),
  };
}
