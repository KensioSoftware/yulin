import { simAthenaAddUnits } from "./sim-athena-date-arithmetic.js";
import { simAthenaParseDate } from "./sim-athena-date-parse.js";
import { simAthenaDateUnit } from "./sim-athena-date-pattern.js";
import { SimAthenaProjectionError } from "./sim-athena-projection-error.js";

/** `NOW` with an offset, split into its three pieces. */
interface SimAthenaRelativeBound {
  readonly sign: string | undefined;
  readonly amount: string | undefined;
  readonly unitName: string | undefined;
}

/**
 * Read `NOW`, `NOW-3YEARS` or `NOW+1DAY`, or nothing where it is neither.
 *
 * Read by hand rather than by pattern, since a pattern with three groups in an
 * optional block is the shape a scanner warns about.
 */
function relativeBound(bound: string): SimAthenaRelativeBound | undefined {
  const text = bound.replaceAll(" ", "").toUpperCase();

  if (text === "NOW") {
    return { sign: undefined, amount: undefined, unitName: undefined };
  }

  if (!text.startsWith("NOW")) {
    return undefined;
  }

  const sign = text.charAt(3);

  if (sign !== "+" && sign !== "-") {
    return undefined;
  }

  const rest = text.slice(4);
  let digits = 0;

  while (
    digits < rest.length &&
    rest.charAt(digits) >= "0" &&
    rest.charAt(digits) <= "9"
  ) {
    digits += 1;
  }

  const amount = rest.slice(0, digits);
  const unitName = rest.slice(digits);

  return amount.length === 0 || unitName.length === 0
    ? undefined
    : { sign, amount, unitName };
}

/**
 * Read one end of a `date` projection's range.
 *
 * A bound is either a date written in the column's own format or `NOW` with an
 * optional offset, as `NOW-3YEARS`. The offset is read against the simulated
 * clock, so a test that froze time projects the same partitions every run.
 */
export function simAthenaDateBound(
  columnName: string,
  bound: string,
  pattern: string,
  now: Date,
): Date {
  const relative = relativeBound(bound);

  if (relative !== undefined) {
    return offsetFrom(columnName, bound, relative, now);
  }

  const parsed = simAthenaParseDate(bound.trim(), pattern);

  if (parsed === undefined) {
    throw new SimAthenaProjectionError(
      `Partition column ${columnName} has range bound ${bound}, which does ` +
        `not read as ${pattern} or as NOW`,
    );
  }

  return parsed;
}

function offsetFrom(
  columnName: string,
  bound: string,
  relative: SimAthenaRelativeBound,
  now: Date,
): Date {
  const { sign, amount, unitName } = relative;

  if (sign === undefined || amount === undefined || unitName === undefined) {
    return new Date(now);
  }

  const unit = simAthenaDateUnit(unitName);

  if (unit === undefined) {
    throw new SimAthenaProjectionError(
      `Partition column ${columnName} has range bound ${bound}, and ` +
        `${unitName} is no unit Athena counts`,
    );
  }

  const steps = Number(amount);

  return simAthenaAddUnits(now, sign === "-" ? -steps : steps, unit);
}
