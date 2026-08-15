/**
 * A refusal naming the Resource whose properties could not be read.
 *
 * Every refusal from this factory carries the logical ID, because a stack
 * holding several listeners and target groups gives a reader nothing else to
 * tell them apart by.
 */
export function simCfnElbV2PropertyError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid sim ELBv2 CloudFormation Resource ${logicalId}: ${reason}`,
  );
}
