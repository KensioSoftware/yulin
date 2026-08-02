/**
 * Build the error a property of an AWS::DynamoDB::Table Resource is refused
 * with.
 *
 * The wording matters. Sim CloudFormation skips a Resource whose error reads as
 * an unsupported Resource type, and skipping is the wrong answer for a table
 * the template described in a way it cannot be created: nothing is missing from
 * the simulation, the template is wrong, and the same template would fail on
 * real CloudFormation.
 */
export function dynamoDbTablePropertyError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid AWS::DynamoDB::Table Resource ${logicalId}: ${reason}`,
  );
}

/**
 * Build the error that skips a Resource over a property that is not simulated.
 *
 * The "Unsupported sim ... CloudFormation" wording is what marks the Resource
 * as skipped rather than failing the stack, so the rest of the template still
 * deploys and the skip reason names the property. The path is the whole way to
 * the property, so a setting on one index of several says which one it was on.
 */
export function dynamoDbTableUnsimulatedPropertyError(
  logicalId: string,
  path: string,
): Error {
  return new Error(
    `Unsupported sim DynamoDB CloudFormation Resource ${logicalId}: ` +
      `${path} is a real AWS::DynamoDB::Table property that simulated ` +
      `DynamoDB does not simulate, so the table is skipped rather than ` +
      `created without it`,
  );
}
