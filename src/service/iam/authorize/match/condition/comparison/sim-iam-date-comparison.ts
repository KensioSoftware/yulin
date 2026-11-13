import { simIamNumberOf } from "./sim-iam-numeric-comparison.js";
import type { SimIamScalarConditionValue } from "./sim-iam-value-comparison.js";

/**
 * The shapes the date half of a W3C date takes, a year and month or a full
 * day.
 */
const w3cMonth = /^\d{4}-\d{2}$/u;
const w3cDay = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * The shapes the clock time of a W3C date takes, with or without seconds,
 * once its zone and fractions of a second are split off.
 */
const w3cMinutes = /^\d{2}:\d{2}$/u;
const w3cSeconds = /^\d{2}:\d{2}:\d{2}$/u;

const zoneSuffix = /[+-]\d{2}:\d{2}$/u;
const fractionText = /^\.\d+$/u;

/**
 * The fields of one W3C date, before they are checked against the calendar.
 */
interface W3cFields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly milliseconds: number;
  readonly zone: string | undefined;
}

/**
 * Read one value as an instant, in milliseconds since the epoch.
 *
 * AWS takes a date in one of the W3C forms of ISO 8601, such as
 * `2026-01-01T00:00:00Z`, `2026-01-01` or `2026-01`, or as epoch seconds
 * written either as a number or as text. `aws:EpochTime` arrives in the
 * second form and `aws:CurrentTime` in the first. A year alone is read as
 * epoch seconds, because `2026` could be either.
 */
export function simIamInstantOf(
  value: SimIamScalarConditionValue,
): number | undefined {
  if (typeof value === "string" && value.includes("-", 1)) {
    return w3cInstant(value);
  }

  const epochSeconds = simIamNumberOf(value);

  return epochSeconds === undefined ? undefined : epochSeconds * 1000;
}

/**
 * Read W3C date text as an instant, refusing a date that does not exist.
 *
 * `Date.parse` rolls `2026-02-30` over into March. A policy naming a day that
 * never comes matches nothing here instead.
 */
function w3cInstant(text: string): number | undefined {
  const fields = w3cFields(text);

  if (fields === undefined) {
    return undefined;
  }

  const { year, month, day, hour, minute, second } = fields;
  const local = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(local);

  if (
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return undefined;
  }

  return local + fields.milliseconds - zoneOffset(fields.zone);
}

/**
 * Split W3C date text into its fields, or nothing where it is not one.
 *
 * A time needs a full day before it, and fractions of a second need the
 * seconds.
 */
function w3cFields(text: string): W3cFields | undefined {
  const [dayText = "", timeText, ...rest] = text.split("T");
  const dayShaped = w3cDay.test(dayText);

  if (rest.length > 0 || !(dayShaped || w3cMonth.test(dayText))) {
    return undefined;
  }

  const [year = 0, month = 0, day = 1] = dayText.split("-").map(Number);

  if (timeText === undefined) {
    return {
      year,
      month,
      day,
      hour: 0,
      minute: 0,
      second: 0,
      milliseconds: 0,
      zone: undefined,
    };
  }

  const time = dayShaped ? clockFields(timeText) : undefined;

  return time === undefined ? undefined : { year, month, day, ...time };
}

/**
 * Split the time half of a W3C date into its fields.
 */
function clockFields(
  text: string,
):
  | Pick<W3cFields, "hour" | "minute" | "second" | "milliseconds" | "zone">
  | undefined {
  const zone = text.endsWith("Z") ? "Z" : zoneSuffix.exec(text)?.[0];
  const unzoned = zone === undefined ? text : text.slice(0, -zone.length);
  const [clock = "", fraction, ...extra] = unzoned.split(".");
  const fractionValid =
    fraction === undefined || fractionText.test(`.${fraction}`);
  const clockValid =
    w3cSeconds.test(clock) ||
    (fraction === undefined && w3cMinutes.test(clock));

  if (!fractionValid || !clockValid || extra.length > 0) {
    return undefined;
  }

  const [hour = 0, minute = 0, second = 0] = clock.split(":").map(Number);

  return {
    hour,
    minute,
    second,
    milliseconds: Math.round(Number(`0.${fraction ?? "0"}`) * 1000),
    zone,
  };
}

/**
 * The offset a zone designator names, in milliseconds east of UTC.
 */
function zoneOffset(zone: string | undefined): number {
  if (zone === undefined || zone === "Z") {
    return 0;
  }

  const sign = zone.startsWith("-") ? -1 : 1;
  const [hours = 0, minutes = 0] = zone.slice(1).split(":").map(Number);

  return sign * (hours * 60 + minutes) * 60_000;
}
