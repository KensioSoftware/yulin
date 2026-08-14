import {
  SimScheduleExpressionError,
  SimUnsimulatedScheduleExpressionError,
} from "../sim-schedule.error.js";
import type { SimCronFieldSpec } from "./sim-cron-field-spec.js";

/**
 * Every way one field of a cron expression can be refused, in one place.
 *
 * Each says which field it is about, since a six field expression gives a
 * reader nothing to go on otherwise, and each says what was written, since a
 * cron expression is usually wrong by one character.
 */
export function cronFieldRefusal(
  spec: SimCronFieldSpec,
  reason: string,
): SimScheduleExpressionError {
  return new SimScheduleExpressionError(`the ${spec.name} field ${reason}`);
}

/**
 * A value outside the range its field takes.
 */
export function cronOutOfRange(
  spec: SimCronFieldSpec,
  token: string,
): SimScheduleExpressionError {
  return cronFieldRefusal(
    spec,
    `takes ${String(spec.minimum)} to ${String(spec.maximum)}, and this one ` +
      `has '${token}'`,
  );
}

/**
 * A part that is neither a number, a name, nor a wildcard.
 */
export function cronUnreadable(
  spec: SimCronFieldSpec,
  token: string,
): SimScheduleExpressionError {
  return cronFieldRefusal(spec, `cannot be read: '${token}'`);
}

/**
 * One of the wildcards real AWS reads and this simulation does not.
 */
export function cronUnsimulatedWildcard(
  spec: SimCronFieldSpec,
): SimUnsimulatedScheduleExpressionError {
  return new SimUnsimulatedScheduleExpressionError(
    `the ${spec.name} field uses 'L', 'W' or '#', which real AWS reads and ` +
      `this simulation does not: only ',', '-', '*', '?' and '/' are read here`,
  );
}

/**
 * A `?` written in a field that is not one of the two day fields.
 */
export function cronUnexpectedAny(
  spec: SimCronFieldSpec,
): SimScheduleExpressionError {
  return cronFieldRefusal(
    spec,
    `does not take '?', which only the day-of-month and day-of-week fields do`,
  );
}

/**
 * A `/` written in a field that does not take a step.
 */
export function cronUnexpectedStep(
  spec: SimCronFieldSpec,
): SimScheduleExpressionError {
  return cronFieldRefusal(spec, `does not take '/'`);
}

/**
 * A step that is not a whole number of at least one.
 */
export function cronBadStep(written: string): SimScheduleExpressionError {
  return new SimScheduleExpressionError(
    `a '/' step is a whole number of at least one, and this one is '${written}'`,
  );
}

/**
 * A part carrying more than one step.
 */
export function cronRepeatedStep(
  spec: SimCronFieldSpec,
  part: string,
): SimScheduleExpressionError {
  return cronFieldRefusal(spec, `has a part with more than one '/': '${part}'`);
}
