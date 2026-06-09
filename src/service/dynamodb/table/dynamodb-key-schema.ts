import type { CreateTableInput, KeyType } from "@aws-sdk/client-dynamodb";
import { assertDefined } from "../../../util/defined/defined.js";
import type { DynamoDbItem } from "../item/dynamodb-item.js";
import type { DynamoDBAttrType } from "../item/dynamodb-item-attribute.js";

type DynamoDbKey = string | number;

/**
 * Extractor for DynamoDB KeySchema from CreateTableCommand input.
 *
 * https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_KeySchemaElement.html
 */
export class DynamoDbKeySchema {
  public readonly partitionKey: { AttributeName: string; KeyType: KeyType };

  public readonly sortKey?: { AttributeName: string; KeyType: KeyType };

  constructor(createTableInput: Pick<CreateTableInput, "KeySchema">) {
    assertDefined(createTableInput.KeySchema, "createTableInput.KeySchema");

    const partitionKeyElement = createTableInput.KeySchema.find(
      (el) => el.KeyType === "HASH",
    );
    assertDefined(
      partitionKeyElement,
      '"CreateTableInput.KeySchema partition key (KeyType=HASH)',
    );
    assertDefined(
      partitionKeyElement.AttributeName,
      "Partition Key AttributeName",
    );
    assertDefined(partitionKeyElement.KeyType, "Partition Key KeyType");
    this.partitionKey = {
      AttributeName: partitionKeyElement.AttributeName,
      KeyType: partitionKeyElement.KeyType,
    };

    const sortKeyElement = createTableInput.KeySchema.find(
      (el) => el.KeyType === "RANGE",
    );
    if (sortKeyElement === undefined) {
      return;
    }
    assertDefined(sortKeyElement.AttributeName, "Sort Key AttributeName");
    assertDefined(sortKeyElement.KeyType, "Sort Key KeyType");
    this.sortKey = {
      AttributeName: sortKeyElement.AttributeName,
      KeyType: sortKeyElement.KeyType,
    };
  }

  /**
   * Make a primary key string for an item based on this key schema.
   */
  makeItemKey(item: DynamoDbItem): string {
    const partitionKeyAttr = item.attributes[this.partitionKey.AttributeName];
    assertDefined(
      partitionKeyAttr,
      `DynamoDB Item partition key ${this.partitionKey.AttributeName}`,
    );
    const partitionKey = partitionKeyAttr.value;
    if (!DynamoDbKeySchema.canBeDynamoDbKey(partitionKey)) {
      throw new TypeError(
        `DynamoDB Item partition key ${this.partitionKey.AttributeName} must be string or number`,
      );
    }

    const keyParts: Record<string, DynamoDbKey> = { partitionKey };

    if (this.sortKey?.AttributeName !== undefined) {
      const sortKey = item.attributes[this.sortKey.AttributeName];
      if (sortKey === undefined) {
        throw new TypeError(
          `DynamoDB Item sort key ${this.sortKey.AttributeName} is undefined`,
        );
      }
      if (!DynamoDbKeySchema.canBeDynamoDbKey(sortKey.value)) {
        throw new TypeError(
          `DynamoDB Item sort key ${this.sortKey.AttributeName} must be string or number`,
        );
      }
      keyParts[this.sortKey.AttributeName] = sortKey.value;
    }

    return JSON.stringify(keyParts);
  }

  /**
   * Check if a given value can be used as a DynamoDB partition key or sort key.
   */
  static canBeDynamoDbKey(value: DynamoDBAttrType): value is DynamoDbKey {
    return typeof value === "string" || typeof value === "number";
  }
}
