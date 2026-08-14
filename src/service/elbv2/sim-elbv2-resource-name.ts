import { SimElbV2ValidationError } from "./error/sim-elbv2.error.js";

/**
 * The characters real ELB takes in a load balancer or target group name:
 * letters, digits and hyphens.
 */
const allowedName = /^[0-9A-Za-z-]+$/u;

/**
 * The longest name real ELB takes, which is the same for both resources.
 */
export const maximumSimElbV2NameLength = 32;

/**
 * Read a load balancer or target group name, refusing one real ELB would not
 * take.
 *
 * Both resources are named under the same rules, so the rules are stated once
 * and the two callers say only which field they are reading and what real ELB
 * additionally reserves.
 */
export function readSimElbV2Name(kind: string, value: string): string {
  if (value === "") {
    throw new SimElbV2ValidationError(`${kind} is required`);
  }

  if (value.length > maximumSimElbV2NameLength) {
    throw new SimElbV2ValidationError(
      `${kind} is at most ${String(maximumSimElbV2NameLength)} characters, ` +
        `and this one is ${String(value.length)}`,
    );
  }

  if (!allowedName.test(value)) {
    throw new SimElbV2ValidationError(
      `${kind} '${value}' is not valid. A name is letters, digits and hyphens.`,
    );
  }

  if (value.startsWith("-") || value.endsWith("-")) {
    throw new SimElbV2ValidationError(
      `${kind} '${value}' cannot begin or end with a hyphen`,
    );
  }

  return value;
}
