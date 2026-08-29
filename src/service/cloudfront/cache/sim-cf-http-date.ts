/**
 * IMF-fixdate, which every sender is required to use. `Sun, 06 Nov 1994
 * 08:49:37 GMT`.
 */
const imfFixdate =
  /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * The obsolete RFC 850 format, which a recipient still has to read.
 * `Sunday, 06-Nov-94 08:49:37 GMT`.
 */
const rfc850Date =
  /^[A-Za-z]{6,9}, \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * The obsolete asctime format, which carries no zone. `Sun Nov  6 08:49:37
 * 1994`.
 */
const asctimeDate =
  /^[A-Za-z]{3} ([A-Za-z]{3}) {1,2}(\d{1,2}) (\d{2}:\d{2}:\d{2}) (\d{4})$/;

/**
 * The instant an HTTP date names, in milliseconds, or none where the value is
 * not one of the three formats HTTP allows.
 *
 * The check matters because `Date.parse` reads far more than HTTP does. It
 * takes `12/31/2099` as a date in 2099 and `0` as the start of the year 2000,
 * and an HTTP cache is required to treat both as an object that has already
 * expired.
 *
 * asctime states no zone and HTTP reads it as GMT, while `Date.parse` would
 * read it in the host's own. It is rewritten with the zone spelled out.
 *
 * https://www.rfc-editor.org/rfc/rfc9110#name-date-time-formats
 */
export function simCfHttpDateInstant(value: string): number | undefined {
  const asctime = asctimeDate.exec(value);
  const parsable =
    asctime === null
      ? value
      : `${asctime[2]} ${asctime[1]} ${asctime[4]} ${asctime[3]} GMT`;

  if (asctime === null && !imfFixdate.test(value) && !rfc850Date.test(value)) {
    return undefined;
  }

  const instant = Date.parse(parsable);

  return Number.isNaN(instant) ? undefined : instant;
}
