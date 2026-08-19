import { assertDefined } from "../../util/type-guard/defined.js";

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Format the time a proxy integration event carries.
 *
 * This is the Common Log Format stamp real events use, such as
 * `12/Mar/2020:19:03:58 +0000`, always in UTC. Payload format 2.0 puts it in
 * `requestContext.time` and format 1.0 in `requestContext.requestTime`, and
 * both carry the same instant in milliseconds beside it for handlers that want
 * to compute with it.
 */
export function simProxyEventTime(at: Date): string {
  const month = months[at.getUTCMonth()];
  assertDefined(month, `Month name for ${at.toISOString()}`);

  const year = String(at.getUTCFullYear());
  const date = `${twoDigits(at.getUTCDate())}/${month}/${year}`;
  const time = [
    twoDigits(at.getUTCHours()),
    twoDigits(at.getUTCMinutes()),
    twoDigits(at.getUTCSeconds()),
  ].join(":");

  return `${date}:${time} +0000`;
}
