import type {
  SimDynamoDbAttributeDefinition,
  SimDynamoDbAttributeDefinitionInput,
  SimDynamoDbScalarAttributeType,
} from "../command/table/table.types.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import {
  assertSimDynamoDbDistinctAttributeNames,
  readSimDynamoDbAttributeDefinition,
} from "./sim-dynamodb-attribute-definition.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";

/**
 * The attributes a simulated table's keys are made of.
 *
 * DynamoDB only defines the attributes its keys use, and it wants them named
 * exactly: an attribute defined that no key uses is refused, and so is a key
 * attribute with no definition. Everything else about an item is schemaless.
 */
export class SimDynamoDbAttributeDefinitions {
  public readonly elements: readonly SimDynamoDbAttributeDefinition[];

  private constructor(elements: readonly SimDynamoDbAttributeDefinition[]) {
    this.elements = elements;
  }

  /**
   * Read the attribute definitions a CreateTable request carries.
   */
  static fromInput(
    input: readonly SimDynamoDbAttributeDefinitionInput[] | undefined,
  ): SimDynamoDbAttributeDefinitions {
    if (input === undefined || input.length === 0) {
      throw new SimDynamoDbValidationException(
        "An AttributeDefinitions entry is required for every key attribute",
      );
    }

    const elements = input.map((definition) =>
      readSimDynamoDbAttributeDefinition(definition),
    );
    assertSimDynamoDbDistinctAttributeNames(elements);

    return new this(elements);
  }

  /**
   * These definitions with the ones an UpdateTable request adds.
   *
   * UpdateTable is the only chance to declare the key attributes of an index it
   * is adding, so what it carries is added to what the table already has rather
   * than replacing it. Redeclaring an attribute as another type is refused,
   * since the items already holding it would no longer be readable by an index
   * keyed on it.
   *
   * The result is a set of its own rather than a change to this one, so a
   * request that turns out to be invalid leaves the table's definitions alone.
   */
  with(
    input: readonly SimDynamoDbAttributeDefinitionInput[] | undefined,
  ): SimDynamoDbAttributeDefinitions {
    if (input === undefined || input.length === 0) {
      return this;
    }

    const added = input.map((definition) =>
      readSimDynamoDbAttributeDefinition(definition),
    );
    assertSimDynamoDbDistinctAttributeNames(added);

    const elements = [...this.elements];

    for (const definition of added) {
      const existing = elements.find(
        (element) => element.AttributeName === definition.AttributeName,
      );

      if (existing === undefined) {
        elements.push(definition);
        continue;
      }

      if (existing.AttributeType !== definition.AttributeType) {
        throw new SimDynamoDbValidationException(
          `AttributeDefinitions redefines the attribute ` +
            `${definition.AttributeName} as ${definition.AttributeType}, and ` +
            `the table already defines it as ${existing.AttributeType}`,
        );
      }
    }

    return new SimDynamoDbAttributeDefinitions(elements);
  }

  /**
   * Refuse a key schema naming an attribute these definitions do not define.
   *
   * This is one half of what CreateTable checks. UpdateTable checks only this
   * half, since a definition the table already carries for an index that has
   * since been deleted is not something the request did wrong.
   */
  assertDefines(keySchema: SimDynamoDbKeySchema): void {
    const definedNames = new Set(
      this.elements.map((element) => element.AttributeName),
    );

    for (const keyName of keySchema.attributeNames()) {
      if (!definedNames.has(keyName)) {
        throw new SimDynamoDbValidationException(
          `The KeySchema${keySchema.subject.owner} names the attribute ` +
            `${keyName}, which has no AttributeDefinition`,
        );
      }
    }
  }

  /**
   * The type declared for an attribute.
   *
   * Every key attribute has a definition by the time a table exists, since
   * CreateTable refuses a key schema and definitions that do not match.
   */
  typeOf(attributeName: string): SimDynamoDbScalarAttributeType {
    const definition = this.elements.find(
      (element) => element.AttributeName === attributeName,
    );

    assertDefined(definition, `AttributeDefinition for ${attributeName}`);

    return definition.AttributeType;
  }

  /**
   * Check these definitions and the key schemas using them name exactly the
   * same attributes.
   *
   * Every key schema a request carries takes part: the table's own, and one for
   * each secondary index. Declaring an index whose key attribute has no
   * definition is the mistake this catches, and it is where CreateTable input
   * most often goes wrong.
   */
  assertMatches(keySchemas: readonly SimDynamoDbKeySchema[]): void {
    const definedNames = new Set(
      this.elements.map((element) => element.AttributeName),
    );
    const keyNames = new Set<string>();

    for (const keySchema of keySchemas) {
      this.assertDefines(keySchema);

      for (const keyName of keySchema.attributeNames()) {
        keyNames.add(keyName);
      }
    }

    for (const definedName of definedNames) {
      if (!keyNames.has(definedName)) {
        throw new SimDynamoDbValidationException(
          `AttributeDefinitions defines the attribute ${definedName}, which ` +
            `no key uses`,
        );
      }
    }
  }
}
