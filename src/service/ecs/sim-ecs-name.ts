import { SimEcsClientException } from "./error/sim-ecs.error.js";

/**
 * The names ECS accepts for a cluster and for a task definition family.
 *
 * Both take up to 255 letters, numbers, hyphens and underscores, and nothing
 * else.
 */
const allowedName = /^[\w-]{1,255}$/;

/**
 * Take an ECS name, refusing one ECS would not accept.
 *
 * The rule is here once because a cluster name and a task definition family
 * are the same rule on real ECS, and a name that would be refused on
 * deployment should be refused here rather than stored.
 */
export function requiredSimEcsName(
  value: string | undefined,
  subject: string,
): string {
  if (value === undefined || value === "") {
    throw new SimEcsClientException(`${subject} cannot be blank.`);
  }

  if (!allowedName.test(value)) {
    throw new SimEcsClientException(
      `Invalid ${subject}: ${value}. Up to 255 letters, numbers, hyphens and ` +
        `underscores are allowed.`,
    );
  }

  return value;
}
