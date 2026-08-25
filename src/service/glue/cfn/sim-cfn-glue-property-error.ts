/**
 * A refusal naming the Glue Resource whose properties could not be read.
 */
export function glueCfnPropertyError(
  resourceType: string,
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid sim Glue CloudFormation Resource ${logicalId} ` +
      `(${resourceType}): ${reason}`,
  );
}
