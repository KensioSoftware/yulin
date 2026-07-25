import { assertDefined } from "../../../util/type-guard/defined.js";
import type { DynamoDBAttributeType } from "../item/dynamodb-item-attribute.js";
import type { DynamoDbItem as DynamoDatabaseItem } from "../item/dynamodb-item.js";
import type {
  SimCreateTableCommandInput,
  SimDynamoDbKeySchemaElement as SimDynamoDatabaseKeySchemaElement,
  SimDynamoDbKeyType as SimDynamoDatabaseKeyType,
} from "../command/create-table/create-table.command.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

type DynamoDatabaseKey = number | string;

type RequiredSimDynamoDatabaseKeySchemaElement =
  SimDynamoDatabaseKeySchemaElement & {
    readonly AttributeName: string;
    readonly KeyType: SimDynamoDatabaseKeyType;
  };

/**
 * Simulated DynamoDB table key schema.
 */
export class DynamoDbKeySchema {
  private readonly hashKeyAttributeName: string;
  private readonly rangeKeyAttributeName: string | undefined;

  constructor(tableInput: SimCreateTableCommandInput) {
    const hashKey = this.requiredKeySchemaElement(tableInput, "HASH");
    this.hashKeyAttributeName = hashKey.AttributeName;

    const rangeKey = this.keySchemaElement(tableInput, "RANGE");
    this.rangeKeyAttributeName = rangeKey?.AttributeName;
  }

  /**
   * Make a primary key string for an item based on this key schema.
   */
  makeItemKey(item: DynamoDatabaseItem): string {
    const partitionKeyAttribute = item.attributes[this.hashKeyAttributeName];
    assertDefined(
      partitionKeyAttribute,
      `DynamoDB Item partition key ${this.hashKeyAttributeName} required`,
    );
    const partitionKey = partitionKeyAttribute.value;
    if (!this.canBeDynamoDbKey(partitionKey)) {
      throw new TypeError(
        `DynamoDB Item partition key ${this.hashKeyAttributeName} must be string or number`,
      );
    }

    const keyParts: Record<string, DynamoDatabaseKey> = {
      [this.hashKeyAttributeName]: partitionKey,
    };

    if (this.rangeKeyAttributeName !== undefined) {
      const sortKeyAttribute = item.attributes[this.rangeKeyAttributeName];
      if (sortKeyAttribute === undefined) {
        throw new TypeError(
          `DynamoDB Item sort key ${this.rangeKeyAttributeName} is undefined`,
        );
      }
      if (!this.canBeDynamoDbKey(sortKeyAttribute.value)) {
        throw new TypeError(
          `DynamoDB Item sort key ${this.rangeKeyAttributeName} must be string or number`,
        );
      }
      keyParts[this.rangeKeyAttributeName] = sortKeyAttribute.value;
    }

    return jsonStringify(keyParts);
  }

  /**
   * Check if a given value can be used as a DynamoDB partition key or sort key.
   */
  private canBeDynamoDbKey(
    value: DynamoDBAttributeType,
  ): value is DynamoDatabaseKey {
    return typeof value === "string" || typeof value === "number";
  }

  private requiredKeySchemaElement(
    tableInput: SimCreateTableCommandInput,
    keyType: SimDynamoDatabaseKeyType,
  ): RequiredSimDynamoDatabaseKeySchemaElement {
    const keySchemaElement = this.keySchemaElement(tableInput, keyType);

    assertDefined(keySchemaElement, `DynamoDB Table ${keyType} key schema`);

    return keySchemaElement;
  }

  private keySchemaElement(
    tableInput: SimCreateTableCommandInput,
    keyType: SimDynamoDatabaseKeyType,
  ): RequiredSimDynamoDatabaseKeySchemaElement | undefined {
    return tableInput.KeySchema?.find(
      (
        keySchemaElement,
      ): keySchemaElement is RequiredSimDynamoDatabaseKeySchemaElement =>
        keySchemaElement.KeyType === keyType &&
        keySchemaElement.AttributeName !== undefined,
    );
  }
}
