import type { SimCronFieldSpec } from "./sim-cron-field-spec.js";
import {
  cronBadStep,
  cronOutOfRange,
  cronUnexpectedStep,
  cronUnreadable,
  cronUnsimulatedWildcard,
} from "./sim-cron-refusals.js";

/**
 * A token using one of the wildcards this simulation reads no meaning from:
 * `L` for the last day, `W` for the nearest weekday, and `#` for the nth
 * weekday of a month.
 */
const unsimulatedWildcard = /^\d*[LW]$|#/u;

const wholeNumber = /^\d+$/u;

/**
 * Read one number of a field, by name where the field has names for them.
 */
function valueOf(spec: SimCronFieldSpec, token: string): number {
  const upper = token.toUpperCase();
  const alias = spec.aliases.get(upper);

  if (alias !== undefined) {
    return alias;
  }

  if (unsimulatedWildcard.test(upper)) {
    throw cronUnsimulatedWildcard(spec);
  }

  if (!wholeNumber.test(upper)) {
    throw cronUnreadable(spec, token);
  }

  const value = Number(upper);

  if (value < spec.minimum || value > spec.maximum) {
    throw cronOutOfRange(spec, token);
  }

  return value;
}

/**
 * Read how far apart the values of a stepped part are.
 */
export function stepOf(spec: SimCronFieldSpec, written: string): number {
  if (!spec.allowsStep) {
    throw cronUnexpectedStep(spec);
  }

  if (!wholeNumber.test(written) || Number(written) < 1) {
    throw cronBadStep(written);
  }

  return Number(written);
}

/**
 * The start and end of one comma separated part, before its step is applied.
 *
 * A bare number with a step behind it starts there and runs to the end of the
 * field, which is what makes minutes `0/15` every quarter hour rather than only
 * the hour itself.
 */
export function boundsOf(
  spec: SimCronFieldSpec,
  written: string,
  stepped: boolean,
): readonly [number, number] {
  if (written === "*") {
    return [spec.minimum, spec.maximum];
  }

  const dash = written.indexOf("-");

  if (dash > 0) {
    return [
      valueOf(spec, written.slice(0, dash)),
      valueOf(spec, written.slice(dash + 1)),
    ];
  }

  const only = valueOf(spec, written);

  return stepped ? [only, spec.maximum] : [only, only];
}
