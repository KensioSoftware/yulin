import type { SimArn } from "../../aws/arn.js";
import type {
  SimDynamoDbLocalSecondaryIndexDescription,
  SimDynamoDbSecondaryIndexInput,
} from "../command/table/table.types.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "../table/sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import { SimDynamoDbFetchedIndexAttributes } from "./sim-dynamodb-fetched-index-attributes.js";
import type { SimDynamoDbIndexAttributes } from "./sim-dynamodb-index-attributes.js";
import { assertSimDynamoDbIndexKeyTypes } from "./sim-dynamodb-index-key-types.js";
import { readSimDynamoDbIndexName } from "./sim-dynamodb-index-name.js";
import { SimDynamoDbIndexProjection } from "./sim-dynamodb-index-projection.js";
import { readSimDynamoDbLocalIndexKeySchema } from "./sim-dynamodb-local-index-key-schema.js";
import { refuseSimDynamoDbLocalIndexThroughput } from "./sim-dynamodb-local-index-throughput.js";
import type {
  SimDynamoDbSecondaryIndex,
  SimDynamoDbSecondaryIndexTable,
} from "./sim-dynamodb-secondary-index.js";

interface SimDynamoDbLocalSecondaryIndexProperties {
  readonly name: string;
  readonly tableArn: SimArn;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly projection: SimDynamoDbIndexProjection;
}

/**
 * One simulated local secondary index.
 *
 * A local secondary index gives an item collection a second sort key. It shares
 * the table's partition key, so an entry sits in the same partition as the item
 * it indexes, which is what lets it answer a strongly consistent read and lets a
 * read of it reach the base table for an attribute it does not project.
 *
 * `CreateTable` is the only place one can be declared. AWS has no call that
 * adds, changes or removes one afterwards, so neither does this.
 */
export class SimDynamoDbLocalSecondaryIndex implements SimDynamoDbSecondaryIndex {
  public readonly name: string;
  public readonly arn: SimArn;
  public readonly keySchema: SimDynamoDbKeySchema;
  public readonly projection: SimDynamoDbIndexProjection;

  private constructor(properties: SimDynamoDbLocalSecondaryIndexProperties) {
    this.name = properties.name;
    // An index ARN is the table's own with the index named under it, which is
    // the resource an IAM policy naming one index is written against.
    this.arn = `${properties.tableArn}/index/${properties.name}`;
    this.keySchema = properties.keySchema;
    this.projection = properties.projection;
  }

  /**
   * Read one `LocalSecondaryIndexes` entry a CreateTable request carries.
   *
   * The name is read first, since every other refusal names the index it is
   * about.
   */
  static fromInput(
    input: SimDynamoDbSecondaryIndexInput,
    table: SimDynamoDbSecondaryIndexTable,
  ): SimDynamoDbLocalSecondaryIndex {
    const name = readSimDynamoDbIndexName(input.IndexName);

    refuseSimDynamoDbLocalIndexThroughput(input, name);

    return new this({
      name,
      tableArn: table.tableArn,
      keySchema: readSimDynamoDbLocalIndexKeySchema(
        input.KeySchema,
        name,
        table.keySchema,
      ),
      projection: SimDynamoDbIndexProjection.fromInput(input.Projection, name),
    });
  }

  /**
   * Which attributes a read of this index answers with.
   */
  attributesOf(
    keyAttributeNames: ReadonlySet<string>,
  ): SimDynamoDbIndexAttributes {
    return new SimDynamoDbFetchedIndexAttributes({
      indexName: this.name,
      projection: this.projection,
      keyAttributeNames,
    });
  }

  /**
   * A local secondary index answers a strongly consistent read.
   *
   * It is written in the same partition as the item it indexes, in the same
   * operation, so there is no window in which it lags behind the table. That is
   * the difference from a global secondary index, which is maintained
   * asynchronously and refuses one.
   */
  assertAnswersConsistentRead(): void {
    return;
  }

  /**
   * A local secondary index is always ready to be read.
   *
   * It is built with the table that carries it, and AWS has no call that adds
   * one afterwards, so there is no window in which it exists and cannot answer.
   */
  assertReadable(): void {
    return;
  }

  /**
   * Refuse an item carrying one of this index's key attributes as another type.
   */
  assertItemKeyTypes(
    item: SimDynamoDbItem,
    attributeDefinitions: SimDynamoDbAttributeDefinitions,
  ): void {
    assertSimDynamoDbIndexKeyTypes({
      indexName: this.name,
      keySchema: this.keySchema,
      item,
      attributeDefinitions,
    });
  }

  /**
   * Describe this index the way DynamoDB reports it.
   *
   * There is no `IndexStatus` and no `ProvisionedThroughput`, since a local
   * secondary index is built with the table and shares its capacity.
   */
  toDescription(): SimDynamoDbLocalSecondaryIndexDescription {
    return {
      IndexName: this.name,
      IndexArn: this.arn,
      KeySchema: this.keySchema.elements,
      Projection: this.projection.toDescription(),
      // Neither figure is tracked, the same way the table's are not.
      ItemCount: 0,
      IndexSizeBytes: 0,
    };
  }
}
