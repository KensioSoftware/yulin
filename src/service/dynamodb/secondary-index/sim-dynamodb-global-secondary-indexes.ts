import type {
  SimDynamoDbGlobalSecondaryIndexDescription,
  SimDynamoDbIndexStatus,
  SimDynamoDbSecondaryIndexInput,
} from "../command/table/table.types.js";
import { SimDynamoDbResourceNotFoundException } from "../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "../table/sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import {
  SimDynamoDbGlobalSecondaryIndex,
  type SimDynamoDbSecondaryIndexTable,
} from "./sim-dynamodb-global-secondary-index.js";
import {
  assertSimDynamoDbIndexCount,
  assertSimDynamoDbIndexNamesDistinct,
  assertSimDynamoDbProjectedAttributeCount,
} from "./sim-dynamodb-index-limits.js";

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

    assertSimDynamoDbIndexCount(input.length);

    const elements = input.map((index) =>
      SimDynamoDbGlobalSecondaryIndex.fromInput(index, table),
    );

    assertSimDynamoDbIndexNamesDistinct(elements);
    assertSimDynamoDbProjectedAttributeCount(elements);

    return new this(elements);
  }

  /**
   * The index a read names, refusing a name this table does not have.
   *
   * Real DynamoDB answers a name it does not have with
   * `ResourceNotFoundException` rather than reading the table instead, since a
   * read of an index that is not there is a read of nothing.
   */
  required(
    indexName: string,
    tableName: string,
  ): SimDynamoDbGlobalSecondaryIndex {
    const index = this.elements.find(
      (candidate) => candidate.name === indexName,
    );

    if (index === undefined) {
      throw new SimDynamoDbResourceNotFoundException(
        `The table ${tableName} does not have the specified index: ${
          indexName
        }`,
      );
    }

    return index;
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
