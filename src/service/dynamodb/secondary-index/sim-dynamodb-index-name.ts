import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * Real DynamoDB allows letters, numbers, underscores, hyphens and periods in an
 * index name, and between 3 and 255 of them, which is the table name rule.
 */
const indexNamePattern = /^[\w.-]{3,255}$/;

/**
 * Read the name a secondary index declares.
 *
 * The name is how a Query or a Scan reaches the index, so a name real DynamoDB
 * would refuse is refused here rather than becoming an index nothing on AWS
 * could name.
 */
export function readSimDynamoDbIndexName(name: string | undefined): string {
  if (name === undefined || name === "") {
    throw new SimDynamoDbValidationException(
      "A secondary index has no IndexName",
    );
  }

  if (!indexNamePattern.test(name)) {
    throw new SimDynamoDbValidationException(
      `IndexName '${name}' is invalid. It can only include letters, numbers, ` +
        `underscores, hyphens and periods, and must be 3 to 255 characters ` +
        `long.`,
    );
  }

  return name;
}
