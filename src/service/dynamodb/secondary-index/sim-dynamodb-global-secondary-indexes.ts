import type {
  SimDynamoDbGlobalSecondaryIndexDescription,
  SimDynamoDbIndexStatus,
  SimDynamoDbSecondaryIndexInput,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "../table/sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import {
  SimDynamoDbGlobalSecondaryIndex,
  type SimDynamoDbSecondaryIndexTable,
} from "./sim-dynamodb-global-secondary-index.js";

/**
 * The most global secondary indexes one table holds.
 */
const maxIndexes = 20;

/**
 * Refuse a request declaring one index name twice.
 *
 * An index is reached by name, so two indexes sharing one leave a read with no
 * way of saying which it meant.
 */
function assertDistinctNames(
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
 * The global secondary indexes one table carries.
 *
 * The collection owns what is about how many there are, and each index owns
 * what is about itself, the same split the table tags follow.
 */
export class SimDynamoDbGlobalSecondaryIndexes {
  public readonly elements: readonly SimDynamoDbGlobalSecondaryIndex[];

  private constructor(elements: readonly SimDynamoDbGlobalSecondaryIndex[]) {
    this.elements = elements;
  }

  /**
   * The indexes of a table declaring none.
   */
  static none(): SimDynamoDbGlobalSecondaryIndexes {
    return new this([]);
  }

  /**
   * Read the `GlobalSecondaryIndexes` a CreateTable request carries.
   */
  static fromInput(
    input: readonly SimDynamoDbSecondaryIndexInput[] | undefined,
    table: SimDynamoDbSecondaryIndexTable,
  ): SimDynamoDbGlobalSecondaryIndexes {
    if (input === undefined || input.length === 0) {
      return this.none();
    }

    if (input.length > maxIndexes) {
      throw new SimDynamoDbValidationException(
        `${input.length.toString()} GlobalSecondaryIndexes were given, and a ` +
          `table holds at most ${maxIndexes.toString()}`,
      );
    }

    const elements = input.map((index) =>
      SimDynamoDbGlobalSecondaryIndex.fromInput(index, table),
    );

    assertDistinctNames(elements);

    return new this(elements);
  }

  /**
   * The key schemas these indexes are read by.
   *
   * `AttributeDefinitions` has to name every key attribute of every index as
   * well as the table's own, so the schemas are reachable together.
   */
  keySchemas(): readonly SimDynamoDbKeySchema[] {
    return this.elements.map((index) => index.keySchema);
  }

  /**
   * Refuse an item carrying an index key attribute as the wrong type.
   */
  assertItemKeyTypes(
    item: SimDynamoDbItem,
    attributeDefinitions: SimDynamoDbAttributeDefinitions,
  ): void {
    for (const index of this.elements) {
      index.assertItemKeyTypes(item, attributeDefinitions);
    }
  }

  /**
   * How a table reports its indexes, which is not at all when it has none.
   *
   * Real DynamoDB leaves `GlobalSecondaryIndexes` out of the description of a
   * table with no index, rather than reporting an empty list.
   */
  descriptions(
    status: SimDynamoDbIndexStatus,
  ): readonly SimDynamoDbGlobalSecondaryIndexDescription[] | undefined {
    if (this.elements.length === 0) {
      return undefined;
    }

    return this.elements.map((index) => index.toDescription(status));
  }
}
