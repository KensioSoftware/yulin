import type { SimArn } from "../../aws/arn.js";
import type {
  SimDynamoDbGlobalSecondaryIndexDescription,
  SimDynamoDbSecondaryIndexInput,
  SimDynamoDbTableStatus,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "../table/sim-dynamodb-attribute-definitions.js";
import { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import { SimDynamoDbKeySchemaSubject } from "../table/sim-dynamodb-key-schema-subject.js";
import type { SimDynamoDbTableThroughput } from "../table/sim-dynamodb-table-throughput.js";
import type { SimDynamoDbIndexAttributes } from "./sim-dynamodb-index-attributes.js";
import { assertSimDynamoDbIndexKeyTypes } from "./sim-dynamodb-index-key-types.js";
import { SimDynamoDbIndexLifecycle } from "./sim-dynamodb-index-lifecycle.js";
import { simDynamoDbIndexStatus } from "./sim-dynamodb-index-status.js";
import { SimDynamoDbIndexProjection } from "./sim-dynamodb-index-projection.js";
import { readSimDynamoDbIndexName } from "./sim-dynamodb-index-name.js";
import { readSimDynamoDbIndexThroughput } from "./sim-dynamodb-index-throughput.js";
import { SimDynamoDbProjectedIndexAttributes } from "./sim-dynamodb-projected-index-attributes.js";
import type {
  SimDynamoDbSecondaryIndex,
  SimDynamoDbSecondaryIndexTable,
} from "./sim-dynamodb-secondary-index.js";

interface SimDynamoDbGlobalSecondaryIndexProperties {
  readonly name: string;
  readonly tableArn: SimArn;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly projection: SimDynamoDbIndexProjection;
  readonly throughput: SimDynamoDbTableThroughput;
  readonly lifecycle: SimDynamoDbIndexLifecycle;
}

/**
 * One simulated global secondary index.
 *
 * An index is a key schema of its own over the same items, so it is held as
 * what a read of it needs to know rather than as a copy of anything. The items
 * it holds are worked out when it is read, which is why nothing here is
 * maintained on the write path.
 */
export class SimDynamoDbGlobalSecondaryIndex implements SimDynamoDbSecondaryIndex {
  public readonly name: string;
  public readonly arn: SimArn;
  public readonly keySchema: SimDynamoDbKeySchema;
  public readonly projection: SimDynamoDbIndexProjection;

  private readonly throughput: SimDynamoDbTableThroughput;
  private readonly lifecycle: SimDynamoDbIndexLifecycle;

  private constructor(properties: SimDynamoDbGlobalSecondaryIndexProperties) {
    this.name = properties.name;
    // An index ARN is the table's own with the index named under it, which is
    // the resource an IAM policy naming one index is written against.
    this.arn = `${properties.tableArn}/index/${properties.name}`;
    this.keySchema = properties.keySchema;
    this.projection = properties.projection;
    this.throughput = properties.throughput;
    this.lifecycle = properties.lifecycle;
  }

  /**
   * Read one `GlobalSecondaryIndexes` entry a CreateTable request carries.
   *
   * The name is read first, since every other refusal names the index it is
   * about.
   */
  static fromInput(
    input: SimDynamoDbSecondaryIndexInput,
    table: SimDynamoDbSecondaryIndexTable,
  ): SimDynamoDbGlobalSecondaryIndex {
    const name = readSimDynamoDbIndexName(input.IndexName);

    return this.declared(
      input,
      table,
      name,
      SimDynamoDbIndexLifecycle.withTable(name),
    );
  }

  /**
   * Read the `Create` of a `GlobalSecondaryIndexUpdates` entry.
   *
   * An index declared this way is added to a table that already holds items, so
   * it backfills where one declared on CreateTable does not. Everything else
   * about it is read the same way, since a template or an SDK caller declares
   * an index in the same shape either way.
   */
  static added(
    input: SimDynamoDbSecondaryIndexInput,
    table: SimDynamoDbSecondaryIndexTable,
  ): SimDynamoDbGlobalSecondaryIndex {
    const name = readSimDynamoDbIndexName(input.IndexName);

    return this.declared(
      input,
      table,
      name,
      SimDynamoDbIndexLifecycle.backfilling(name),
    );
  }

  private static declared(
    input: SimDynamoDbSecondaryIndexInput,
    table: SimDynamoDbSecondaryIndexTable,
    name: string,
    lifecycle: SimDynamoDbIndexLifecycle,
  ): SimDynamoDbGlobalSecondaryIndex {
    return new this({
      name,
      tableArn: table.tableArn,
      keySchema: SimDynamoDbKeySchema.fromInput(
        input.KeySchema,
        SimDynamoDbKeySchemaSubject.index(name),
      ),
      projection: SimDynamoDbIndexProjection.fromInput(input.Projection, name),
      throughput: readSimDynamoDbIndexThroughput(input, name, table.billing),
      lifecycle,
    });
  }

  /**
   * Finish building this index, so reads of it are answered.
   */
  activate(): void {
    this.lifecycle.activate();
  }

  /**
   * Refuse a read of this index while it is still being built.
   */
  assertReadable(): void {
    this.lifecycle.assertReadable();
  }

  /**
   * Which attributes a read of this index answers with.
   *
   * A global secondary index is held apart from the table, so what it projects
   * is the whole of what a read of it can answer with.
   */
  attributesOf(
    keyAttributeNames: ReadonlySet<string>,
  ): SimDynamoDbIndexAttributes {
    return new SimDynamoDbProjectedIndexAttributes({
      indexName: this.name,
      projection: this.projection,
      keyAttributeNames,
    });
  }

  /**
   * Refuse a strongly consistent read of this index.
   *
   * A global secondary index is maintained asynchronously on AWS, so it cannot
   * answer one at all. Every read here is strongly consistent, so accepting the
   * request and ignoring the flag would leave a test passing on something real
   * DynamoDB refuses outright.
   */
  assertAnswersConsistentRead(): void {
    throw new SimDynamoDbValidationException(
      `Consistent reads are not supported on global secondary indexes, and ` +
        `this request asks for one on ${this.name}`,
    );
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
   * The table's status is taken rather than the index's own, since a table
   * being deleted reports every index as DELETING whatever each one was doing.
   */
  toDescription(
    tableStatus: SimDynamoDbTableStatus,
  ): SimDynamoDbGlobalSecondaryIndexDescription {
    return {
      IndexName: this.name,
      IndexArn: this.arn,
      KeySchema: this.keySchema.elements,
      Projection: this.projection.toDescription(),
      IndexStatus: simDynamoDbIndexStatus(tableStatus, this.lifecycle.status),
      Backfilling: this.lifecycle.backfilling,
      ProvisionedThroughput: this.throughput.toDescription(),
      // Neither figure is tracked, the same way the table's are not.
      ItemCount: 0,
      IndexSizeBytes: 0,
    };
  }
}
