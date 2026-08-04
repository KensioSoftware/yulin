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
