import { assertDefined } from "../../../util/type-guard/defined.js";
import type {
  SimDynamoDbKeySchemaElement,
  SimDynamoDbKeySchemaElementInput,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { readSimDynamoDbKeySchemaElement } from "./sim-dynamodb-key-schema-element.js";
import type { SimDynamoDbKeySchemaShape } from "./sim-dynamodb-key-schema-shape.js";
import { simDynamoDbSingleAttributeKeys } from "./sim-dynamodb-key-schema-shape.js";
import { SimDynamoDbKeySchemaSubject } from "./sim-dynamodb-key-schema-subject.js";

/**
 * The key of one simulated table or one of its secondary indexes.
 *
 * A key schema lists its HASH elements and then its RANGE elements, in that
 * order. A table takes one HASH element and at most one RANGE element. A global
 * secondary index takes up to four of each. Anything else is refused here as
 * it is on AWS. The subject is what the key schema belongs to, so a request
 * carrying several of them is refused naming the one that was wrong.
 */
export class SimDynamoDbKeySchema {
  public readonly elements: readonly SimDynamoDbKeySchemaElement[];
  public readonly subject: SimDynamoDbKeySchemaSubject;

  /** The partition key attributes, in the order the key schema lists them. */
  public readonly partitionKeyAttributeNames: readonly string[];

  /** The sort key attributes, in the order they sort by. */
  public readonly sortKeyAttributeNames: readonly string[];

  /**
   * The first partition key attribute, which for a table is the only one.
   */
  public readonly hashKeyAttributeName: string;

  /**
   * The first sort key attribute, which for a table is the only one.
   */
  public readonly rangeKeyAttributeName: string | undefined;

  private constructor(
    elements: readonly SimDynamoDbKeySchemaElement[],
    subject: SimDynamoDbKeySchemaSubject,
  ) {
    this.elements = elements;
    this.subject = subject;
    this.partitionKeyAttributeNames = namesOf(elements, "HASH");
    this.sortKeyAttributeNames = namesOf(elements, "RANGE");

    const hashKey = this.partitionKeyAttributeNames.at(0);
    assertDefined(hashKey, "DynamoDB HASH key schema element");

    this.hashKeyAttributeName = hashKey;
    this.rangeKeyAttributeName = this.sortKeyAttributeNames.at(0);
  }

  /**
   * Read a key schema a CreateTable request carries.
   *
   * The subject defaults to the table's own key schema, which is the one a
   * request always has, and the shape to the one a table's key takes.
   */
  static fromInput(
    input: readonly SimDynamoDbKeySchemaElementInput[] | undefined,
    subject: SimDynamoDbKeySchemaSubject = SimDynamoDbKeySchemaSubject.table(),
    shape: SimDynamoDbKeySchemaShape = simDynamoDbSingleAttributeKeys,
  ): SimDynamoDbKeySchema {
    if (input === undefined || input.length === 0) {
      throw new SimDynamoDbValidationException(
        `A KeySchema with a HASH key element is required${subject.owner}`,
      );
    }

    assertSize(input.length, shape, subject);

    const elements: SimDynamoDbKeySchemaElement[] = [];

    for (const element of input) {
      elements.push(
        readSimDynamoDbKeySchemaElement(element, elements, shape, subject),
      );
    }

    if (namesOf(elements, "RANGE").length > shape.sortKeys) {
      throw subject.refuse(
        `a key schema holds at most ${shape.sortKeys.toString()} RANGE ` +
          `elements`,
      );
    }

    return new this(elements, subject);
  }

  /**
   * The attributes this key schema names, partition key first.
   */
  attributeNames(): readonly string[] {
    return this.elements.map((element) => element.AttributeName);
  }
}

/**
 * Refuse a key schema with more elements than its shape takes in all.
 */
function assertSize(
  size: number,
  shape: SimDynamoDbKeySchemaShape,
  subject: SimDynamoDbKeySchemaSubject,
): void {
  if (size <= shape.partitionKeys + shape.sortKeys) {
    return;
  }

  if (shape.partitionKeys === 1) {
    throw subject.refuse(
      `a key schema holds a HASH element and at most one RANGE element, ` +
        `but ${size.toString()} elements were given`,
    );
  }

  throw subject.refuse(
    `a key schema holds at most ${shape.partitionKeys.toString()} HASH ` +
      `elements and ${shape.sortKeys.toString()} RANGE elements, but ` +
      `${size.toString()} elements were given`,
  );
}

/**
 * The attribute names of the elements of one key type, in order.
 */
function namesOf(
  elements: readonly SimDynamoDbKeySchemaElement[],
  keyType: SimDynamoDbKeySchemaElement["KeyType"],
): readonly string[] {
  return elements
    .filter((element) => element.KeyType === keyType)
    .map((element) => element.AttributeName);
}
