import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";

/**
 * The highest priority real ELB takes on a listener rule.
 */
const maximumPriority = 50_000;

/**
 * Read the priority a request names for a rule.
 *
 * Priority decides which rule claims a request when more than one could, so it
 * is required rather than defaulted: a rule with no place in the order has no
 * defined behaviour once a second rule exists.
 */
export function simElbV2RulePriority(value: number | undefined): number {
  if (value === undefined) {
    throw new SimElbV2ValidationError("Priority is required");
  }

  if (!Number.isSafeInteger(value) || value < 1 || value > maximumPriority) {
    throw new SimElbV2ValidationError(
      `Priority ${String(value)} is not between 1 and ${String(maximumPriority)}`,
    );
  }

  return value;
}
