/**
 * Build the error a property of a simulated DynamoDB Resource is refused with.
 *
 * Refusing is now the rarer answer. A property simulated DynamoDB cannot act on
 * is recorded against the Resource and the table is created without it, so what
 * is left here is the template that describes no table at all: a global table
 * with no replica, a key schema that is not a list. Nothing is missing from
 * this simulation in those cases, the template is wrong, and the same template
 * would fail on real CloudFormation.
 *
 * The Resource type is named rather than assumed, since `AWS::DynamoDB::Table`
 * and `AWS::DynamoDB::GlobalTable` describe the same table in different
 * property names, and a refusal naming the wrong one sends whoever reads it to
 * the wrong page of the documentation.
 */
export function dynamoDbPropertyError(
  resourceTypeName: string,
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid ${resourceTypeName} Resource ${logicalId}: ${reason}`,
  );
}
