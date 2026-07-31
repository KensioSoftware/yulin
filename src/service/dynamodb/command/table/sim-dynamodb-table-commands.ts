import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbTableStore } from "../../table/sim-dynamodb-table-store.js";
import type { SimDynamoDbTableAccess } from "./sim-dynamodb-table-access.js";
import { SimDynamoDbTablePage } from "./sim-dynamodb-table-page.js";
import type {
  SimDeleteTableCommand,
  SimDeleteTableCommandOutput,
  SimDescribeTableCommand,
  SimDescribeTableCommandOutput,
  SimListTablesCommand,
  SimListTablesCommandOutput,
} from "./table.command.js";

interface SimDynamoDbTableCommandsProperties {
  readonly tables: SimDynamoDbTableStore;
  readonly access: SimDynamoDbTableAccess;
  readonly background: BackgroundScheduler;
}

interface SimDynamoDbTableCommandsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that describe, list and delete tables.
 */
export class SimDynamoDbTableCommands {
  private readonly tables: SimDynamoDbTableStore;
  private readonly access: SimDynamoDbTableAccess;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimDynamoDbTableCommandsProperties) {
    this.tables = properties.tables;
    this.access = properties.access;
    this.background = properties.background;
  }

  /**
   * Describe a table, the way it was created.
   *
   * The description is the same one CreateTable answered with, read off the
   * table itself, so a test can check a table came out the way the request or
   * the template meant it to.
   */
  describeTable(
    command: SimDescribeTableCommand,
    options?: SimDynamoDbTableCommandsOptions,
  ): SimDescribeTableCommandOutput {
    const table = this.access.required(
      "dynamodb:DescribeTable",
      command.input.TableName,
      options?.caller,
    );

    return { Table: table.toDescription(), $metadata: {} };
  }

  /**
   * List the table names in this scope, in DynamoDB's order.
   *
   * Real DynamoDB gives this action no table-level permission, so it authorizes
   * against every table in the Account and Region and does not filter the list
   * by what the caller can reach.
   */
  listTables(
    command: SimListTablesCommand,
    options?: SimDynamoDbTableCommandsOptions,
  ): SimListTablesCommandOutput {
    this.access.authorizeAnyTable("dynamodb:ListTables", options?.caller);

    const page = new SimDynamoDbTablePage(this.tables.names(), command.input);

    return {
      TableNames: page.names,
      LastEvaluatedTableName: page.lastEvaluatedTableName,
      $metadata: {},
    };
  }

  /**
   * Delete a table, and the items on it.
   *
   * The table goes into DELETING at once and is gone by the time the background
   * work has run, which is the sequence real DynamoDB goes through. A table
   * already deleting is not an error: the request asks for a state it is
   * already heading to.
   */
  deleteTable(
    command: SimDeleteTableCommand,
    options?: SimDynamoDbTableCommandsOptions,
  ): SimDeleteTableCommandOutput {
    const name = this.access.reference(command.input.TableName);
    const table = this.access.requiredByName(
      "dynamodb:DeleteTable",
      name,
      options?.caller,
    );

    if (table.status !== "DELETING") {
      table.assertDeletable();
      table.beginDeletion();
      this.background.schedule(() => {
        this.tables.remove(name);
        return Promise.resolve();
      });
    }

    return { TableDescription: table.toDescription(), $metadata: {} };
  }
}
