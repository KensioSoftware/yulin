import { assertDefined } from "../../../util/type-guard/defined.js";
import type {
  SimDynamoDbKeySchemaElement,
  SimDynamoDbKeySchemaElementInput,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { readSimDynamoDbKeySchemaElement } from "./sim-dynamodb-key-schema-element.js";
import { SimDynamoDbKeySchemaSubject } from "./sim-dynamodb-key-schema-subject.js";

/**
 * The key of one simulated table or one of its secondary indexes.
 *
 * A key schema is one HASH element, optionally followed by one RANGE element,
 * in that order. Anything else is refused here as it is on AWS. The subject is
 * what the key schema belongs to, so a request carrying several of them is
 * refused naming the one that was wrong.
 */
export class SimDynamoDbKeySchema {
  public readonly elements: readonly SimDynamoDbKeySchemaElement[];
  public readonly subject: SimDynamoDbKeySchemaSubject;
  public readonly hashKeyAttributeName: string;
  public readonly rangeKeyAttributeName: string | undefined;

  private constructor(
    elements: readonly SimDynamoDbKeySchemaElement[],
    subject: SimDynamoDbKeySchemaSubject,
  ) {
    const [hashKey, rangeKey] = elements;
    assertDefined(hashKey, "DynamoDB HASH key schema element");
    const hashKeyName = hashKey.AttributeName;

    if (rangeKey?.AttributeName === hashKeyName) {
      throw subject.refuse(
        `the HASH and RANGE elements both name the attribute ${hashKeyName}`,
      );
    }

    this.elements = elements;
    this.subject = subject;
    this.hashKeyAttributeName = hashKey.AttributeName;
    this.rangeKeyAttributeName = rangeKey?.AttributeName;
  }

  /**
   * Read a key schema a CreateTable request carries.
   *
   * The subject defaults to the table's own key schema, which is the one a
   * request always has.
   */
  static fromInput(
    input: readonly SimDynamoDbKeySchemaElementInput[] | undefined,
    subject: SimDynamoDbKeySchemaSubject = SimDynamoDbKeySchemaSubject.table(),
  ): SimDynamoDbKeySchema {
    if (input === undefined || input.length === 0) {
      throw new SimDynamoDbValidationException(
        `A KeySchema with a HASH key element is required${subject.owner}`,
      );
    }

    if (input.length > 2) {
      throw subject.refuse(
        `a key schema holds a HASH element and at most one RANGE element, ` +
          `but ${input.length.toString()} elements were given`,
      );
    }

    return new this(
      input.map((element, index) =>
        readSimDynamoDbKeySchemaElement(element, index, subject),
      ),
      subject,
    );
  }

  /**
   * The attributes this key schema names, partition key first.
   */
  attributeNames(): readonly string[] {
    return this.elements.map((element) => element.AttributeName);
  }
}
