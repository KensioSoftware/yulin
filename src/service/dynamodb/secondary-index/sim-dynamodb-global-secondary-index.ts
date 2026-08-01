import type { SimArn } from "../../aws/arn.js";
import type {
  SimDynamoDbGlobalSecondaryIndexDescription,
  SimDynamoDbIndexStatus,
  SimDynamoDbSecondaryIndexInput,
} from "../command/table/table.types.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "../table/sim-dynamodb-attribute-definitions.js";
import { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import { SimDynamoDbKeySchemaSubject } from "../table/sim-dynamodb-key-schema-subject.js";
import type { SimDynamoDbTableBilling } from "../table/sim-dynamodb-table-billing.js";
import type { SimDynamoDbTableThroughput } from "../table/sim-dynamodb-table-throughput.js";
import { assertSimDynamoDbIndexKeyTypes } from "./sim-dynamodb-index-key-types.js";
import { SimDynamoDbIndexProjection } from "./sim-dynamodb-index-projection.js";
import { readSimDynamoDbIndexName } from "./sim-dynamodb-index-name.js";
import { readSimDynamoDbIndexThroughput } from "./sim-dynamodb-index-throughput.js";

/**
 * What a secondary index needs from the table it is declared on.
 */
export interface SimDynamoDbSecondaryIndexTable {
  readonly tableArn: SimArn;
  readonly billing: SimDynamoDbTableBilling;
}

interface SimDynamoDbGlobalSecondaryIndexProperties {
  readonly name: string;
  readonly tableArn: SimArn;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly projection: SimDynamoDbIndexProjection;
  readonly throughput: SimDynamoDbTableThroughput;
}

/**
 * One simulated global secondary index.
 *
 * An index is a key schema of its own over the same items, so it is held as
 * what a read of it needs to know rather than as a copy of anything. The items
 * it holds are worked out when it is read, which is why nothing here is
 * maintained on the write path.
 */
export class SimDynamoDbGlobalSecondaryIndex {
  public readonly name: string;
  public readonly arn: SimArn;
  public readonly keySchema: SimDynamoDbKeySchema;
  public readonly projection: SimDynamoDbIndexProjection;

  private readonly throughput: SimDynamoDbTableThroughput;

  private constructor(properties: SimDynamoDbGlobalSecondaryIndexProperties) {
    this.name = properties.name;
    // An index ARN is the table's own with the index named under it, which is
    // the resource an IAM policy naming one index is written against.
    this.arn = `${properties.tableArn}/index/${properties.name}`;
    this.keySchema = properties.keySchema;
    this.projection = properties.projection;
    this.throughput = properties.throughput;
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

    return new this({
      name,
      tableArn: table.tableArn,
      keySchema: SimDynamoDbKeySchema.fromInput(
        input.KeySchema,
        SimDynamoDbKeySchemaSubject.index(name),
      ),
      projection: SimDynamoDbIndexProjection.fromInput(input.Projection, name),
      throughput: readSimDynamoDbIndexThroughput(input, name, table.billing),
    });
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
   */
  toDescription(
    status: SimDynamoDbIndexStatus,
  ): SimDynamoDbGlobalSecondaryIndexDescription {
    return {
      IndexName: this.name,
      IndexArn: this.arn,
      KeySchema: this.keySchema.elements,
      Projection: this.projection.toDescription(),
      IndexStatus: status,
      ProvisionedThroughput: this.throughput.toDescription(),
      // Neither figure is tracked, the same way the table's are not.
      ItemCount: 0,
      IndexSizeBytes: 0,
    };
  }
}
