/**
 * A refusal naming the Resource whose properties could not be read.
 *
 * Every refusal from this factory carries the logical ID, because a stack
 * holding several task definitions gives a reader nothing else to tell them
 * apart by.
 */
export function simCfnEcsPropertyError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid sim ECS CloudFormation Resource ${logicalId}: ${reason}`,
  );
}
