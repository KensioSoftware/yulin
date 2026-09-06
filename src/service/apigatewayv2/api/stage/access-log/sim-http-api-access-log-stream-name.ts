import type { SimClock } from "../../../../../util/clock/sim-clock.js";

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The stream a stage's access log events are written to.
 *
 * Real API Gateway rolls access log streams over time and appends an
 * identifier this simulation has no counterpart for. The hour is what decides
 * the stream here, dated from the simulation's clock, so a test that froze
 * time gets one stream and a predictable name for it. The shape is chosen for
 * the simulation rather than copied from an observed account, and a test
 * reading its lines back should filter the log group rather than name the
 * stream.
 */
export function simHttpApiAccessLogStreamName(clock: SimClock): string {
  const at = clock.now();

  return [
    String(at.getUTCFullYear()),
    twoDigits(at.getUTCMonth() + 1),
    twoDigits(at.getUTCDate()),
    twoDigits(at.getUTCHours()),
  ].join("-");
}
