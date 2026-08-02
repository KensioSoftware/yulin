import type {
  SimDynamoDbGlobalSecondaryIndexDescription,
  SimDynamoDbSecondaryIndexInput,
  SimDynamoDbTableStatus,
} from "../command/table/table.types.js";
import { SimDynamoDbResourceNotFoundException } from "../error/dynamodb.error.js";
import { SimDynamoDbGlobalSecondaryIndex } from "./sim-dynamodb-global-secondary-index.js";
import { assertSimDynamoDbIndexCount } from "./sim-dynamodb-index-limits.js";
import type { SimDynamoDbTableUpdate } from "../table/sim-dynamodb-table-update.js";
import type { SimDynamoDbSecondaryIndexTable } from "./sim-dynamodb-secondary-index.js";

/**
 * The global secondary indexes one table carries.
 *
 * The collection owns what is about how many there are, and each index owns
 * what is about itself, the same split the table tags follow. The rules that
 * span both kinds of index, such as a name being unique across them, belong to
 * `SimDynamoDbSecondaryIndexes` instead.
 *
 * UpdateTable adds and removes indexes on a live table, so what a table carries
 * changes over its life. The collection is what changes, rather than the table
 * being given a new one, so everything already holding the table keeps reading
 * the indexes it has now.
 */
export class SimDynamoDbGlobalSecondaryIndexes {
  #elements: SimDynamoDbGlobalSecondaryIndex[];

  private constructor(elements: SimDynamoDbGlobalSecondaryIndex[]) {
    this.#elements = elements;
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
   * The indexes this table carries now.
   */
  get elements(): readonly SimDynamoDbGlobalSecondaryIndex[] {
    return this.#elements;
  }

  /**
   * Take the part of an UpdateTable that adds or removes an index.
   *
   * A request carries at most one of either, since that is AWS's limit, and
   * both have already been checked against the table by this point. A local
   * secondary index is never here, because neither AWS nor this changes one
   * after the table exists.
   */
  applyUpdate(update: SimDynamoDbTableUpdate): void {
    if (update.indexCreated !== undefined) {
      this.#elements.push(update.indexCreated);
    }

    if (update.indexDeleted !== undefined) {
      this.remove(update.indexDeleted);
    }
  }

  /**
   * Find a global secondary index by name, refusing one this table lacks.
   *
   * UpdateTable names an index to delete rather than describing it, and real
   * DynamoDB answers a name it does not have with `ResourceNotFoundException`.
   * A local secondary index is not found here either, since neither AWS nor
   * this changes one through `GlobalSecondaryIndexUpdates`.
   */
  required(
    indexName: string,
    tableName: string,
  ): SimDynamoDbGlobalSecondaryIndex {
    const index = this.#elements.find(
      (candidate) => candidate.name === indexName,
    );

    if (index === undefined) {
      throw new SimDynamoDbResourceNotFoundException(
        `The table ${tableName} does not have the specified global secondary ` +
          `index: ${indexName}`,
      );
    }

    return index;
  }

  /**
   * Finish building every index this table carries.
   */
  activate(): void {
    for (const index of this.#elements) {
      index.activate();
    }
  }

  /**
   * How a table reports its indexes, which is not at all when it has none.
   *
   * Real DynamoDB leaves `GlobalSecondaryIndexes` out of the description of a
   * table with no index, rather than reporting an empty list.
   */
  descriptions(
    tableStatus: SimDynamoDbTableStatus,
  ): readonly SimDynamoDbGlobalSecondaryIndexDescription[] | undefined {
    if (this.#elements.length === 0) {
      return undefined;
    }

    return this.#elements.map((index) => index.toDescription(tableStatus));
  }

  /**
   * Take an index off this table.
   */
  private remove(indexName: string): void {
    this.#elements = this.#elements.filter((index) => index.name !== indexName);
  }
}
