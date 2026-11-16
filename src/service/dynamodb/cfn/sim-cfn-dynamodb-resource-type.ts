/**
 * The CloudFormation Resource type of an ordinary table.
 */
export const dynamoDbTableResourceTypeName = "AWS::DynamoDB::Table";

/**
 * The CloudFormation Resource type CDK's `TableV2` synthesises, whether or not
 * any replica regions were asked for.
 *
 * A global table naming one replica is an ordinary table in that region, which
 * is why the two type names sit together rather than one of them standing for
 * something this simulation has no answer for.
 */
export const dynamoDbGlobalTableResourceTypeName = "AWS::DynamoDB::GlobalTable";

/**
 * The creator for a DynamoDB Resource type, refusing a type nothing creates.
 *
 * The refusal names the type in the words sim CloudFormation reads as an
 * unsupported Resource, so the stack skips it rather than failing.
 */
export function requireSimCfnDynamoDbCreator<Creator>(
  creators: ReadonlyMap<string, Creator>,
  resourceTypeName: string,
): Creator {
  for (const [name, creator] of creators) {
    if (name === resourceTypeName) {
      return creator;
    }
  }

  throw new Error(
    `Unsupported sim DynamoDB CloudFormation Resource ${resourceTypeName}`,
  );
}
