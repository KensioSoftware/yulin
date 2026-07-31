import { assertDefined } from "../../../util/type-guard/defined.js";
import type {
  SimDynamoDbKeySchemaElement,
  SimDynamoDbKeySchemaElementInput,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { readSimDynamoDbKeySchemaElement } from "./sim-dynamodb-key-schema-element.js";

/**
 * The primary key of one simulated table.
 *
 * A key schema is one HASH element, optionally followed by one RANGE element,
 * in that order. Anything else is refused here as it is on AWS.
 */
export class SimDynamoDbKeySchema {
  public readonly elements: readonly SimDynamoDbKeySchemaElement[];
  public readonly hashKeyAttributeName: string;
  public readonly rangeKeyAttributeName: string | undefined;

  private constructor(elements: readonly SimDynamoDbKeySchemaElement[]) {
    const [hashKey, rangeKey] = elements;
    assertDefined(hashKey, "DynamoDB Table HASH key schema element");

    if (rangeKey?.AttributeName === hashKey.AttributeName) {
      throw new SimDynamoDbValidationException(
        `Invalid KeySchema: the HASH and RANGE key elements both name the ` +
          `attribute ${hashKey.AttributeName}`,
      );
    }

    this.elements = elements;
    this.hashKeyAttributeName = hashKey.AttributeName;
    this.rangeKeyAttributeName = rangeKey?.AttributeName;
  }

  /**
   * Read the key schema a CreateTable request carries.
   */
  static fromInput(
    input: readonly SimDynamoDbKeySchemaElementInput[] | undefined,
  ): SimDynamoDbKeySchema {
    if (input === undefined || input.length === 0) {
      throw new SimDynamoDbValidationException(
        "A KeySchema with a HASH key element is required",
      );
    }

    if (input.length > 2) {
      throw new SimDynamoDbValidationException(
        `Invalid KeySchema: a table key schema holds a HASH element and at ` +
          `most one RANGE element, but ${input.length.toString()} elements ` +
          `were given`,
      );
    }

    return new this(
      input.map((element, index) =>
        readSimDynamoDbKeySchemaElement(element, index),
      ),
    );
  }

  /**
   * The attributes this key schema names, partition key first.
   */
  attributeNames(): readonly string[] {
    return this.elements.map((element) => element.AttributeName);
  }
}
