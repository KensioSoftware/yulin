import type { Brand } from "../../../util/brand.type.js";
import type { CreateTableCommand, TableStatus } from "@aws-sdk/client-dynamodb";
import { DynamoDbKeySchema } from "./dynamodb-key-schema.js";
import { assertDefined } from "../../../util/defined.js";
import type { DynamoDbItem } from "../item/dynamodb-item.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";

export type DynamoDbTableName = Brand<string, "DynamoDbTableName">;

/**
 * Simulated DynamoDB Table.
 */
export class SimDynamoDbTable {
  public readonly creationDateTime: Date;

  public readonly tableName: DynamoDbTableName;

  private readonly _keySchema: DynamoDbKeySchema;
  private _status: TableStatus = "CREATING";

  private readonly items = new Map<string, DynamoDbItem>();

  constructor(
    createCommand: CreateTableCommand,
    private readonly background: BackgroundScheduler,
  ) {
    assertDefined(
      createCommand.input.TableName,
      "createCommand.input.TableName",
    );
    this.tableName = createCommand.input.TableName as DynamoDbTableName;
    this.creationDateTime = new Date();

    if (
      createCommand.input.KeySchema === undefined ||
      createCommand.input.KeySchema.length === 0
    ) {
      throw new Error("Table KeySchema is not defined");
    }
    this._keySchema = new DynamoDbKeySchema(createCommand.input);
  }

  /**
   * Simulate the table entering ACTIVE status.
   */
  activate(): Promise<void> {
    this._status = "ACTIVE";
    return Promise.resolve();
  }

  /**
   * Get the current table status.
   */
  public get status(): TableStatus {
    return this._status;
  }

  /**
   * Put an item into the table.
   */
  public putItem(item: DynamoDbItem): Promise<void> {
    const keyString = this._keySchema.makeItemKey(item);
    this.background.schedule(() => {
      this.items.set(keyString, item);
      return Promise.resolve();
    });
    return Promise.resolve();
  }
}
