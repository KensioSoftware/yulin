import type { Brand } from "../../../util/brand.type.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

export type DynamoDbTableName = Brand<string, "DynamoDbTableName">;

/**
 * Real DynamoDB allows letters, numbers, underscores, hyphens and periods, and
 * between 3 and 255 of them.
 */
const tableNamePattern = /^[\w.-]{3,255}$/;

/**
 * The name of one simulated table.
 *
 * A table name is unique within an account and region, and is the resource part
 * of the table ARN. Checking it in one place is what keeps a name that works
 * here one that would work on real AWS.
 */
export class SimDynamoDbTableName {
  public readonly value: DynamoDbTableName;

  private constructor(value: string) {
    this.value = value as DynamoDbTableName;
  }

  /**
   * Read the table name a request has to carry.
   */
  static required(name: string | undefined): SimDynamoDbTableName {
    if (name === undefined || name === "") {
      throw new SimDynamoDbValidationException("A TableName is required");
    }

    return this.of(name);
  }

  /**
   * Read a table name from request input, refusing one real DynamoDB refuses.
   */
  static of(value: string): SimDynamoDbTableName {
    if (!tableNamePattern.test(value)) {
      throw new SimDynamoDbValidationException(
        `TableName '${value}' is invalid. It can only include letters, ` +
          `numbers, underscores, hyphens and periods, and must be 3 to 255 ` +
          `characters long.`,
      );
    }

    return new this(value);
  }
}
