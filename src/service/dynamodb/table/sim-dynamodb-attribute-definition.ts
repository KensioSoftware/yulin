import type {
  SimDynamoDbAttributeDefinition,
  SimDynamoDbAttributeDefinitionInput,
  SimDynamoDbScalarAttributeType,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

const scalarAttributeTypes: ReadonlySet<string> = new Set(["S", "N", "B"]);

/**
 * Read one attribute definition a request carries.
 */
export function readSimDynamoDbAttributeDefinition(
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
 * Refuse a set of definitions naming one attribute more than once.
 *
 * A request that defines an attribute twice does not say which definition it
 * meant, whether or not the two agree, so both CreateTable and UpdateTable
 * refuse one in the same words.
 */
export function assertSimDynamoDbDistinctAttributeNames(
  elements: readonly SimDynamoDbAttributeDefinition[],
): void {
  const names = new Set(elements.map((element) => element.AttributeName));

  if (names.size !== elements.length) {
    throw new SimDynamoDbValidationException(
      "AttributeDefinitions names an attribute more than once",
    );
  }
}
