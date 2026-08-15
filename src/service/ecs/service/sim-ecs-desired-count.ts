import { SimEcsInvalidParameterException } from "../error/sim-ecs.error.js";

/**
 * How many tasks one service may be kept at, as real ECS limits it.
 *
 * Every one of them is a simulated task object in this process, so a test
 * asking for the whole quota gets what it asked for and pays for it in memory.
 */
const maxDesiredCount = 5000;

/**
 * Take the number of tasks a service is to be kept at.
 *
 * Zero is allowed and means a service that exists and runs nothing, which is
 * what scaling a service to nothing leaves and what `DeleteService` wants
 * before it will delete one.
 */
export function simEcsDesiredCount(count: number): number {
  if (!Number.isSafeInteger(count) || count < 0 || count > maxDesiredCount) {
    throw new SimEcsInvalidParameterException(
      `desiredCount must be a whole number from 0 to ` +
        `${String(maxDesiredCount)}.`,
    );
  }

  return count;
}
