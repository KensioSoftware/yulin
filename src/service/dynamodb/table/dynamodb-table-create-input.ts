import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCreateTableCommand } from "../command/create-table/create-table.command.js";
import { DynamoDbKeySchema as DynamoDatabaseKeySchema } from "./dynamodb-key-schema.js";
import type { DynamoDbTableName as DynamoDatabaseTableName } from "./sim-dynamodb-table.js";

/**
 * Extract and validate DynamoDB table creation input.
 */
export class DynamoDbTableCreateInput {
  constructor(private readonly tableCommand: SimCreateTableCommand) {
    //
  }

  /**
   * Extract the table name.
   */
  tableName(): DynamoDatabaseTableName {
    assertDefined(
      this.tableCommand.input.TableName,
      "tableCommand.input.TableName",
    );

    return this.tableCommand.input.TableName as DynamoDatabaseTableName;
  }

  /**
   * Build the key schema.
   */
  keySchema(): DynamoDatabaseKeySchema {
    if (
      this.tableCommand.input.KeySchema === undefined ||
      this.tableCommand.input.KeySchema.length === 0
    ) {
      throw new Error("Table KeySchema is not defined");
    }

    return new DynamoDatabaseKeySchema(this.tableCommand.input);
  }
}
