import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCreateTableCommand } from "../command/create-table/create-table.cmd.js";
import { DynamoDbKeySchema as DynamoDatabaseKeySchema } from "./dynamodb-key-schema.js";
import type { DynamoDbTableName as DynamoDatabaseTableName } from "./sim-dynamodb-table.js";

/**
 * Extract and validate DynamoDB table creation input.
 */
export class DynamoDbTableCreateInput {
  constructor(private readonly createCommand: SimCreateTableCommand) {
    //
  }

  /**
   * Extract the table name.
   */
  tableName(): DynamoDatabaseTableName {
    assertDefined(
      this.createCommand.input.TableName,
      "createCommand.input.TableName",
    );

    return this.createCommand.input.TableName as DynamoDatabaseTableName;
  }

  /**
   * Build the key schema.
   */
  keySchema(): DynamoDatabaseKeySchema {
    if (
      this.createCommand.input.KeySchema === undefined ||
      this.createCommand.input.KeySchema.length === 0
    ) {
      throw new Error("Table KeySchema is not defined");
    }

    return new DynamoDatabaseKeySchema(this.createCommand.input);
  }
}
