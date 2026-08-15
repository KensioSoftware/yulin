import { SimElbV2ValidationError } from "../../../error/sim-elbv2.error.js";

/**
 * The longest condition value real ELB takes.
 *
 * The limit is the same for a host name and for a path pattern, and it is per
 * value rather than across the list.
 */
const maximumValueLength = 128;

/**
 * Read the values a condition compares against, refusing a list ELB would not
 * take.
 *
 * The length limit is real ELB's rather than one of this simulation's own. A
 * pattern longer than this is accepted here and refused by AWS, which is the
 * divergence worth avoiding: a test passes and the deployment fails.
 *
 * It also bounds what the matcher compiles. A pattern with many wildcards
 * still compiles to that many `.*` runs, and a backtracking engine can take a
 * while to settle on a long near miss, so the bound is worth having even
 * though it is not what stops that. What stops it is that a condition value is
 * written by whoever wrote the rule and is never carried on a request, so the
 * only run a pathological pattern can hold up is that author's own. A cap on
 * wildcards is deliberately not added, since real ELB has none and a rule AWS
 * accepts should not be refused here.
 */
export function requireSimElbV2ConditionValues(
  values: readonly string[],
  field: string,
): readonly string[] {
  if (values.length === 0) {
    throw new SimElbV2ValidationError(
      `A '${field}' condition requires at least one value`,
    );
  }

  const tooLong = values.find((value) => value.length > maximumValueLength);

  if (tooLong !== undefined) {
    throw new SimElbV2ValidationError(
      `A '${field}' condition value is ${String(tooLong.length)} characters, ` +
        `and ELB takes at most ${String(maximumValueLength)}`,
    );
  }

  return values;
}
