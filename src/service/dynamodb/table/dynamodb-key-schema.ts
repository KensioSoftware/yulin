import { assertDefined } from "../../../util/type-guard/defined.js";
import type { DynamoDBAttrType } from "../item/dynamodb-item-attribute.js";
import type { DynamoDbItem } from "../item/dynamodb-item.js";
import type {
  SimCreateTableCommandInput,
  SimDynamoDbKeySchemaElement,
  SimDynamoDbKeyType,
} from "../command/create-table/create-table.cmd.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

type DynamoDbKey = number | string;

type RequiredSimDynamoDbKeySchemaElement = SimDynamoDbKeySchemaElement & {
  readonly AttributeName: string;
  readonly KeyType: SimDynamoDbKeyType;
};

/**
 * Simulated DynamoDB table key schema.
 */
export class DynamoDbKeySchema {
  private readonly hashKeyAttributeName: string;
  private readonly rangeKeyAttributeName: string | undefined;

  constructor(createTableInput: SimCreateTableCommandInput) {
    const hashKey = this.requiredKeySchemaElement(createTableInput, "HASH");
    this.hashKeyAttributeName = hashKey.AttributeName;

    const rangeKey = this.keySchemaElement(createTableInput, "RANGE");
    this.rangeKeyAttributeName = rangeKey?.AttributeName;
  }

  private requiredKeySchemaElement(
    createTableInput: SimCreateTableCommandInput,
    keyType: SimDynamoDbKeyType,
  ): RequiredSimDynamoDbKeySchemaElement {
    const keySchemaElement = this.keySchemaElement(createTableInput, keyType);

    assertDefined(keySchemaElement, `DynamoDB Table ${keyType} key schema`);

    return keySchemaElement;
  }

  private keySchemaElement(
    createTableInput: SimCreateTableCommandInput,
    keyType: SimDynamoDbKeyType,
  ): RequiredSimDynamoDbKeySchemaElement | undefined {
    return createTableInput.KeySchema?.find(
      (
        keySchemaElement,
      ): keySchemaElement is RequiredSimDynamoDbKeySchemaElement =>
        keySchemaElement.KeyType === keyType &&
        keySchemaElement.AttributeName !== undefined,
    );
  }

  /**
   * Make a primary key string for an item based on this key schema.
   */
  makeItemKey(item: DynamoDbItem): string {
    const partitionKeyAttr = item.attributes[this.hashKeyAttributeName];
    assertDefined(
      partitionKeyAttr,
      `DynamoDB Item partition key ${this.hashKeyAttributeName}`,
    );
    const partitionKey = partitionKeyAttr.value;
    if (!DynamoDbKeySchema.canBeDynamoDbKey(partitionKey)) {
      throw new TypeError(
        `DynamoDB Item partition key ${this.hashKeyAttributeName} must be string or number`,
      );
    }

    const keyParts: Record<string, DynamoDbKey> = {
      [this.hashKeyAttributeName]: partitionKey,
    };

    if (this.rangeKeyAttributeName !== undefined) {
      const sortKeyAttr = item.attributes[this.rangeKeyAttributeName];
      if (sortKeyAttr === undefined) {
        throw new TypeError(
          `DynamoDB Item sort key ${this.rangeKeyAttributeName} is undefined`,
        );
      }
      if (!DynamoDbKeySchema.canBeDynamoDbKey(sortKeyAttr.value)) {
        throw new TypeError(
          `DynamoDB Item sort key ${this.rangeKeyAttributeName} must be string or number`,
        );
      }
      keyParts[this.rangeKeyAttributeName] = sortKeyAttr.value;
    }

    return jsonStringify(keyParts);
  }

  /**
   * Check if a given value can be used as a DynamoDB partition key or sort key.
   */
  static canBeDynamoDbKey(value: DynamoDBAttrType): value is DynamoDbKey {
    return typeof value === "string" || typeof value === "number";
  }
}
