import type { SimDynamoDbSecondaryIndexInput } from "../command/table/table.types.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "../table/sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import { SimDynamoDbGlobalSecondaryIndexes } from "./sim-dynamodb-global-secondary-indexes.js";
import {
  assertSimDynamoDbIndexNamesDistinct,
  assertSimDynamoDbProjectedAttributeCount,
} from "./sim-dynamodb-index-limits.js";
import { requiredSimDynamoDbIndex } from "./sim-dynamodb-index-lookup.js";
import { SimDynamoDbLocalSecondaryIndexes } from "./sim-dynamodb-local-secondary-indexes.js";
import type {
  SimDynamoDbSecondaryIndex,
  SimDynamoDbSecondaryIndexTable,
} from "./sim-dynamodb-secondary-index.js";

/**
 * The parts of a CreateTable request that declare secondary indexes.
 */
export interface SimDynamoDbSecondaryIndexesInput {
  readonly GlobalSecondaryIndexes?:
    readonly SimDynamoDbSecondaryIndexInput[] | undefined;
  readonly LocalSecondaryIndexes?:
    readonly SimDynamoDbSecondaryIndexInput[] | undefined;
}

interface SimDynamoDbSecondaryIndexesProperties {
  readonly global: SimDynamoDbGlobalSecondaryIndexes;
  readonly local: SimDynamoDbLocalSecondaryIndexes;
}

/**
 * Every secondary index one table carries, of both kinds.
 *
 * The two kinds are declared apart and described apart, so each has a
 * collection of its own. What they share is a table: one namespace for their
 * names, one cap on how many attributes they project between them, and one
 * `IndexName` parameter reaching either of them. Those rules live here, since
 * neither collection can see the other.
 */
export class SimDynamoDbSecondaryIndexes {
  public readonly global: SimDynamoDbGlobalSecondaryIndexes;
  public readonly local: SimDynamoDbLocalSecondaryIndexes;

  private constructor(properties: SimDynamoDbSecondaryIndexesProperties) {
    this.global = properties.global;
    this.local = properties.local;
  }

  /**
   * The indexes of a table declaring none of either kind.
   */
  static none(): SimDynamoDbSecondaryIndexes {
    return new this({
      global: SimDynamoDbGlobalSecondaryIndexes.none(),
      local: SimDynamoDbLocalSecondaryIndexes.none(),
    });
  }

  /**
   * Read the secondary indexes a CreateTable request declares.
   */
  static fromInput(
    input: SimDynamoDbSecondaryIndexesInput,
    table: SimDynamoDbSecondaryIndexTable,
  ): SimDynamoDbSecondaryIndexes {
    const indexes = new this({
      global: SimDynamoDbGlobalSecondaryIndexes.fromInput(
        input.GlobalSecondaryIndexes,
        table,
      ),
      local: SimDynamoDbLocalSecondaryIndexes.fromInput(
        input.LocalSecondaryIndexes,
        table,
      ),
    });

    assertSimDynamoDbIndexNamesDistinct(indexes.elements);
    assertSimDynamoDbProjectedAttributeCount(indexes.elements);

    return indexes;
  }

  /**
   * Every index the table carries, whichever kind it is.
   */
  get elements(): readonly SimDynamoDbSecondaryIndex[] {
    return [...this.global.elements, ...this.local.elements];
  }

  /**
   * The index a read names, refusing one this table cannot answer with.
   *
   * A name the table does not have is refused, and so is an index that is
   * still being built, since real DynamoDB answers neither.
   */
  required(indexName: string, tableName: string): SimDynamoDbSecondaryIndex {
    const index = requiredSimDynamoDbIndex(this.elements, indexName, tableName);
    index.assertReadable();

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
}
