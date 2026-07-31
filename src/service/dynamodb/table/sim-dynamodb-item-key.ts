import { jsonStringify } from "../../../util/type-guard/json.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { simDynamoDbBinaryText } from "../item/sim-dynamodb-binary.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type {
  SimDynamoDbBinaryValue,
  SimDynamoDbNumberValue,
  SimDynamoDbStringValue,
  SimDynamoDbValue,
} from "../item/sim-dynamodb-value.js";
import type { SimDynamoDbScalarAttributeType } from "../command/table/table.types.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";

/**
 * A value a key attribute can hold. DynamoDB keys are scalar: a set, a list or
 * a map cannot be one.
 */
type SimDynamoDbKeyValue =
  SimDynamoDbStringValue | SimDynamoDbNumberValue | SimDynamoDbBinaryValue;

/**
 * Refuse a key value of a type the table did not declare for it.
 */
function assertDeclaredType(
  attributeName: string,
  value: SimDynamoDbValue,
  declared: SimDynamoDbScalarAttributeType,
): asserts value is SimDynamoDbKeyValue {
  if (value.kind !== declared) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: Type mismatch for key ` +
        `attribute ${attributeName}, expected ${declared} but got ${value.kind}`,
    );
  }
}

/**
 * The text a key value is marshalled to, which is what makes two items with
 * the same key the same item.
 *
 * Binary goes through base64, so two key values holding the same bytes marshal
 * the same way. A number goes through its normalised digits, so `1` and `1.0`
 * are one key rather than two.
 */
function keyText(value: SimDynamoDbKeyValue): string {
  switch (value.kind) {
    case "S": {
      return value.text;
    }
    case "N": {
      return value.number.text;
    }
    case "B": {
      return simDynamoDbBinaryText(value.bytes);
    }
  }
}

/**
 * Reads the primary key of an item, following a table's key schema.
 *
 * A key attribute has to be there, has to be the type the table declared for
 * it, and cannot be empty. Real DynamoDB checks all three before it writes,
 * because an item that broke any of them could never be read back by key.
 */
export class SimDynamoDbItemKey {
  private readonly keySchema: SimDynamoDbKeySchema;
  private readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;

  constructor(
    keySchema: SimDynamoDbKeySchema,
    attributeDefinitions: SimDynamoDbAttributeDefinitions,
  ) {
    this.keySchema = keySchema;
    this.attributeDefinitions = attributeDefinitions;
  }

  /**
   * Make the primary key string for an item.
   */
  of(item: SimDynamoDbItem): string {
    return jsonStringify(
      this.keySchema.elements.map((element) => [
        element.AttributeName,
        this.keyValue(item, element.AttributeName),
      ]),
    );
  }

  /**
   * Make the primary key string for the Key a request names an item by.
   *
   * A Key is the whole primary key and nothing else. An item may carry any
   * attributes alongside its key, but the commands that name one item by its
   * key cannot: an attribute that is not part of the key has nothing to match
   * against, so DynamoDB refuses it rather than ignoring it.
   *
   * Real DynamoDB answers `The provided key element does not match the schema`
   * without saying which attribute was at fault. The attribute is named here as
   * well, since a test reading the failure is better off knowing.
   */
  ofKey(key: SimDynamoDbItem): string {
    for (const attributeName of key.attributeNames()) {
      if (!this.keySchema.attributeNames().includes(attributeName)) {
        throw new SimDynamoDbValidationException(
          `The provided key element does not match the schema: the Key names ` +
            `the attribute ${attributeName}, which is not part of the ` +
            `table's primary key`,
        );
      }
    }

    return this.of(key);
  }

  /**
   * Read one key attribute of an item, checking it against the key schema.
   */
  private keyValue(item: SimDynamoDbItem, attributeName: string): string {
    const value = item.attribute(attributeName);

    if (value === undefined) {
      throw new SimDynamoDbValidationException(
        `One of the required keys was not given a value: ${attributeName}`,
      );
    }

    assertDeclaredType(
      attributeName,
      value,
      this.attributeDefinitions.typeOf(attributeName),
    );

    const text = keyText(value);

    if (text === "") {
      throw new SimDynamoDbValidationException(
        `One or more parameter values are not valid. The AttributeValue for ` +
          `key attribute ${attributeName} cannot be empty`,
      );
    }

    return `${value.kind}:${text}`;
  }
}
