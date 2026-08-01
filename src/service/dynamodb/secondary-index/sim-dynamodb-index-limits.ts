import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbGlobalSecondaryIndex } from "./sim-dynamodb-global-secondary-index.js";

/**
 * The most global secondary indexes one table holds.
 */
export const maxSimDynamoDbIndexes = 20;

/**
 * The most NonKeyAttributes one table projects across all of its indexes.
 */
const maxProjectedAttributes = 100;

/**
 * Refuse a request declaring more indexes than a table holds.
 *
 * This is checked before the indexes are read, so a request well over the cap
 * is refused for being over it rather than for whatever is wrong with its
 * twenty first index.
 */
export function assertSimDynamoDbIndexCount(count: number): void {
  if (count > maxSimDynamoDbIndexes) {
    throw new SimDynamoDbValidationException(
      `${count.toString()} GlobalSecondaryIndexes were given, and a table ` +
        `holds at most ${maxSimDynamoDbIndexes.toString()}`,
    );
  }
}

/**
 * Refuse a request declaring one index name twice.
 *
 * An index is reached by name, so two indexes sharing one leave a read with no
 * way of saying which it meant.
 */
export function assertSimDynamoDbIndexNamesDistinct(
  elements: readonly SimDynamoDbGlobalSecondaryIndex[],
): void {
  const names = new Set(elements.map((index) => index.name));

  if (names.size !== elements.length) {
    throw new SimDynamoDbValidationException(
      "GlobalSecondaryIndexes names an index more than once, and an index " +
        "name is unique within a table",
    );
  }
}

/**
 * Refuse a table projecting more attributes than DynamoDB lets it.
 *
 * The 20 an index projects is not the whole rule: a table is capped at 100
 * across all of its indexes too, which six fully projecting indexes reach. An
 * attribute projected into two indexes counts twice, so this is a plain sum
 * rather than a count of distinct names, as it is on AWS.
 */
export function assertSimDynamoDbProjectedAttributeCount(
  elements: readonly SimDynamoDbGlobalSecondaryIndex[],
): void {
  const projected = elements.reduce(
    (total, index) => total + index.projection.nonKeyAttributeCount,
    0,
  );

  if (projected > maxProjectedAttributes) {
    const most = maxProjectedAttributes.toString();

    throw new SimDynamoDbValidationException(
      `${projected.toString()} NonKeyAttributes are projected across the ` +
        `table's indexes, and a table projects at most ${most}`,
    );
  }
}
