import type {
  SimDynamoDbLocalSecondaryIndexDescription,
  SimDynamoDbSecondaryIndexInput,
} from "../command/table/table.types.js";
import { assertSimDynamoDbLocalIndexCount } from "./sim-dynamodb-index-limits.js";
import { assertSimDynamoDbTableSortsForLocalIndexes } from "./sim-dynamodb-local-index-key-schema.js";
import { SimDynamoDbLocalSecondaryIndex } from "./sim-dynamodb-local-secondary-index.js";
import type { SimDynamoDbSecondaryIndexTable } from "./sim-dynamodb-secondary-index.js";

/**
 * The local secondary indexes one table carries.
 *
 * As with the global ones, the collection owns what is about how many there
 * are and each index owns what is about itself. What is added here is the one
 * rule about the table rather than about any index: a table with no sort key
 * has no collection for a second sort key to reorder.
 */
export class SimDynamoDbLocalSecondaryIndexes {
  public readonly elements: readonly SimDynamoDbLocalSecondaryIndex[];

  private constructor(elements: readonly SimDynamoDbLocalSecondaryIndex[]) {
    this.elements = elements;
  }

  /**
   * The indexes of a table declaring none.
   */
  static none(): SimDynamoDbLocalSecondaryIndexes {
    return new this([]);
  }

  /**
   * Read the `LocalSecondaryIndexes` a CreateTable request carries.
   */
  static fromInput(
    input: readonly SimDynamoDbSecondaryIndexInput[] | undefined,
    table: SimDynamoDbSecondaryIndexTable,
  ): SimDynamoDbLocalSecondaryIndexes {
    if (input === undefined || input.length === 0) {
      return this.none();
    }

    assertSimDynamoDbLocalIndexCount(input.length);
    assertSimDynamoDbTableSortsForLocalIndexes(table.keySchema);

    return new this(
      input.map((index) =>
        SimDynamoDbLocalSecondaryIndex.fromInput(index, table),
      ),
    );
  }

  /**
   * How a table reports its indexes, which is not at all when it has none.
   *
   * Real DynamoDB leaves `LocalSecondaryIndexes` out of the description of a
   * table with no index, rather than reporting an empty list.
   */
  descriptions():
    readonly SimDynamoDbLocalSecondaryIndexDescription[] | undefined {
    if (this.elements.length === 0) {
      return undefined;
    }

    return this.elements.map((index) => index.toDescription());
  }
}
