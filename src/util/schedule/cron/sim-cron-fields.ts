import { SimScheduleExpressionError } from "../sim-schedule.error.js";
import { SimCronField } from "./sim-cron-field.js";
import type { SimCronFieldSpec } from "./sim-cron-field-spec.js";

/**
 * The six fields of a cron expression, once each has been read.
 */
export interface SimCronFields {
  readonly minutes: SimCronField;
  readonly hours: SimCronField;
  readonly dayOfMonth: SimCronField;
  readonly month: SimCronField;
  readonly dayOfWeek: SimCronField;
  readonly year: SimCronField;
}

/**
 * Read every field of an expression, in the positions the dialect describes.
 */
export function readFields(
  specs: readonly SimCronFieldSpec[],
  written: readonly string[],
): SimCronFields {
  const [minutes, hours, dayOfMonth, month, dayOfWeek, year] = specs.map(
    (spec, index) => SimCronField.of(spec, written.at(index) ?? ""),
  );

  if (
    minutes === undefined ||
    hours === undefined ||
    dayOfMonth === undefined ||
    month === undefined ||
    dayOfWeek === undefined ||
    year === undefined
  ) {
    throw new SimScheduleExpressionError(
      "a cron dialect describes six fields: minutes, hours, day-of-month, " +
        "month, day-of-week and year",
    );
  }

  // AWS asks for `?` in one of the two day fields, since a rule naming both
  // the 1st and Monday has no obvious meaning: one reading is the 1st when it
  // falls on a Monday, and the other is the 1st and also every Monday.
  if (!dayOfMonth.isAny && !dayOfWeek.isAny) {
    throw new SimScheduleExpressionError(
      "the day-of-month and day-of-week fields cannot both be given: use " +
        "'?' in whichever of the two is not deciding the day",
    );
  }

  return { minutes, hours, dayOfMonth, month, dayOfWeek, year };
}
