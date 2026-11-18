import type { SimUpdateTableCommandInput } from "../command/table/table.command.js";
import type { SimDynamoDbTableClass } from "../command/table/table.types.js";
import type { SimDynamoDbGlobalSecondaryIndex } from "../secondary-index/sim-dynamodb-global-secondary-index.js";
import type { SimDynamoDbStreamRequest } from "../stream/sim-dynamodb-stream-specification.js";
import { readSimDynamoDbStreamUpdate } from "../stream/sim-dynamodb-stream-update.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import { SimDynamoDbIndexUpdate } from "./sim-dynamodb-index-update.js";
import type { SimDynamoDbTableBilling } from "./sim-dynamodb-table-billing.js";
import type { SimDynamoDbTableThroughput } from "./sim-dynamodb-table-throughput.js";
import {
  assertSimDynamoDbUpdateAsksForSomething,
  assertSimDynamoDbUpdateIsOneOperation,
} from "./sim-dynamodb-table-update-rules.js";
import { readSimDynamoDbTableClass } from "./sim-dynamodb-table-class.js";
import type { SimDynamoDbUpdatableTable } from "./sim-dynamodb-updatable-table.js";
import { readSimDynamoDbUpdatedBilling } from "./sim-dynamodb-updated-billing.js";
import {
  simDynamoDbCreatedIndex,
  simDynamoDbDeletedIndexName,
  simDynamoDbIndexThroughputs,
} from "./sim-dynamodb-updated-indexes.js";

export interface SimDynamoDbTableUpdateProperties {
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  readonly billing: SimDynamoDbTableBilling | undefined;
  readonly indexCreated: SimDynamoDbGlobalSecondaryIndex | undefined;
  readonly indexDeleted: string | undefined;
  readonly indexThroughputs: ReadonlyMap<string, SimDynamoDbTableThroughput>;
  readonly tableClass: SimDynamoDbTableClass | undefined;
  readonly deletionProtectionEnabled: boolean | undefined;
  readonly stream: SimDynamoDbStreamRequest | undefined;
}

/**
 * One change an UpdateTable request makes to a table.
 *
 * Everything the request says is read and checked here, against the table as it
 * stands, before any of it is applied. That is what keeps a request that turns
 * out to be invalid from leaving a half-updated table behind.
 */
export class SimDynamoDbTableUpdate {
  public readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  public readonly billing: SimDynamoDbTableBilling | undefined;
  public readonly indexCreated: SimDynamoDbGlobalSecondaryIndex | undefined;
  public readonly indexDeleted: string | undefined;

  /** The capacity each index whose capacity changes is given. */
  public readonly indexThroughputs: ReadonlyMap<
    string,
    SimDynamoDbTableThroughput
  >;

  public readonly tableClass: SimDynamoDbTableClass | undefined;
  public readonly deletionProtectionEnabled: boolean | undefined;
  public readonly stream: SimDynamoDbStreamRequest | undefined;

  private constructor(properties: SimDynamoDbTableUpdateProperties) {
    assertSimDynamoDbUpdateAsksForSomething(properties);

    this.attributeDefinitions = properties.attributeDefinitions;
    this.billing = properties.billing;
    this.indexCreated = properties.indexCreated;
    this.indexDeleted = properties.indexDeleted;
    this.indexThroughputs = properties.indexThroughputs;
    this.tableClass = properties.tableClass;
    this.deletionProtectionEnabled = properties.deletionProtectionEnabled;
    this.stream = properties.stream;
  }

  /**
   * Read the change an UpdateTable request asks a table for.
   */
  static fromInput(
    input: SimUpdateTableCommandInput,
    table: SimDynamoDbUpdatableTable,
  ): SimDynamoDbTableUpdate {
    const indexUpdate = SimDynamoDbIndexUpdate.fromInput(
      input.GlobalSecondaryIndexUpdates,
    );
    const billing = readSimDynamoDbUpdatedBilling(input, table);
    assertSimDynamoDbUpdateIsOneOperation(billing, indexUpdate);

    // UpdateTable is the only chance to declare the key attributes of the index
    // it is adding, so the definitions it carries are added to the table's.
    const attributeDefinitions = table.attributeDefinitions.with(
      input.AttributeDefinitions,
    );

    return new this({
      attributeDefinitions,
      billing,
      indexCreated: simDynamoDbCreatedIndex(
        indexUpdate,
        table,
        attributeDefinitions,
      ),
      indexDeleted: simDynamoDbDeletedIndexName(indexUpdate, table),
      indexThroughputs: simDynamoDbIndexThroughputs(
        indexUpdate,
        table,
        billing,
      ),
      tableClass: readSimDynamoDbTableClass(input.TableClass),
      deletionProtectionEnabled: input.DeletionProtectionEnabled,
      stream: readSimDynamoDbStreamUpdate(input, table.stream),
    });
  }
}
