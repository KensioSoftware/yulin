import type {
  SimDynamoDbGlobalSecondaryIndexDescription,
  SimDynamoDbIndexStatus,
  SimDynamoDbSecondaryIndexInput,
} from "../command/table/table.types.js";
import { SimDynamoDbGlobalSecondaryIndex } from "./sim-dynamodb-global-secondary-index.js";
import { assertSimDynamoDbIndexCount } from "./sim-dynamodb-index-limits.js";
import type { SimDynamoDbSecondaryIndexTable } from "./sim-dynamodb-secondary-index.js";

/**
 * The global secondary indexes one table carries.
 *
 * The collection owns what is about how many there are, and each index owns
 * what is about itself, the same split the table tags follow. The rules that
 * span both kinds of index, such as a name being unique across them, belong to
 * `SimDynamoDbSecondaryIndexes` instead.
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

    assertSimDynamoDbIndexCount(input.length);

    return new this(
      input.map((index) =>
        SimDynamoDbGlobalSecondaryIndex.fromInput(index, table),
      ),
    );
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
