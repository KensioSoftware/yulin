import type { Brand } from "../../util/brand.type.js";
import type { CreateTableCommand, TableStatus } from "@aws-sdk/client-dynamodb";

export type DynamoDbTableName = Brand<string, "DynamoDbTableName">;

/**
 * Simulated DynamoDB Table.
 */
export class SimDynamoDbTable {
  public readonly creationDateTime: Date;

  private readonly _tableName: DynamoDbTableName;
  private _status: TableStatus = "CREATING";

  constructor(private readonly createCommand: CreateTableCommand) {
    if (createCommand.input.TableName === undefined) {
      throw new Error(
        "DynamoDB CreateTableCommand.input.TableName is required",
      );
    }
    this._tableName = this.createCommand.input.TableName as DynamoDbTableName;
    this.creationDateTime = new Date();
  }

  /**
   * Simulate the table entering ACTIVE status.
   */
  activate(): Promise<void> {
    this._status = "ACTIVE";
    return Promise.resolve();
  }

  /**
   * Get the DynamoDB table name.
   */
  public get tableName(): DynamoDbTableName {
    return this._tableName;
  }

  /**
   * Get the current table status.
   */
  public get status(): TableStatus {
    return this._status;
  }
}
