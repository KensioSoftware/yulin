import type {
  SimDynamoDbAttributeDefinition,
  SimDynamoDbAttributeDefinitionInput,
  SimDynamoDbScalarAttributeType,
} from "../command/table/table.types.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";

const scalarAttributeTypes: ReadonlySet<string> = new Set(["S", "N", "B"]);

/**
 * Read one attribute definition a request carries.
 */
function attributeDefinition(
  definition: SimDynamoDbAttributeDefinitionInput,
): SimDynamoDbAttributeDefinition {
  const { AttributeName: name, AttributeType: type } = definition;

  if (name === undefined || name === "") {
    throw new SimDynamoDbValidationException(
      "An AttributeDefinition has no AttributeName",
    );
  }

  if (type === undefined || !scalarAttributeTypes.has(type)) {
    throw new SimDynamoDbValidationException(
      `AttributeDefinition for ${name} has AttributeType '${type ?? ""}'. A ` +
        `key attribute is one of S, N or B.`,
    );
  }

  return {
    AttributeName: name,
    AttributeType: type as SimDynamoDbScalarAttributeType,
  };
}

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

    const elements = input.map((definition) => attributeDefinition(definition));
    const names = new Set(elements.map((element) => element.AttributeName));

    if (names.size !== elements.length) {
      throw new SimDynamoDbValidationException(
        "AttributeDefinitions names an attribute more than once",
      );
    }

    return new this(elements);
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
      for (const keyName of keySchema.attributeNames()) {
        keyNames.add(keyName);

        if (!definedNames.has(keyName)) {
          throw new SimDynamoDbValidationException(
            `The KeySchema${keySchema.subject.owner} names the attribute ` +
              `${keyName}, which has no AttributeDefinition`,
          );
        }
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
