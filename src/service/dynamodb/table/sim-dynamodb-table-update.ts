import type { SimUpdateTableCommandInput } from "../command/table/table.command.js";
import type { SimDynamoDbTableClass } from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbGlobalSecondaryIndex } from "../secondary-index/sim-dynamodb-global-secondary-index.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import { SimDynamoDbIndexUpdate } from "./sim-dynamodb-index-update.js";
import type { SimDynamoDbTableBilling } from "./sim-dynamodb-table-billing.js";
import { readSimDynamoDbTableClass } from "./sim-dynamodb-table-class.js";
import type { SimDynamoDbUpdatableTable } from "./sim-dynamodb-updatable-table.js";
import { readSimDynamoDbUpdatedBilling } from "./sim-dynamodb-updated-billing.js";
import {
  simDynamoDbCreatedIndex,
  simDynamoDbDeletedIndexName,
} from "./sim-dynamodb-updated-indexes.js";

interface SimDynamoDbTableUpdateProperties {
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  readonly billing: SimDynamoDbTableBilling | undefined;
  readonly indexCreated: SimDynamoDbGlobalSecondaryIndex | undefined;
  readonly indexDeleted: string | undefined;
  readonly tableClass: SimDynamoDbTableClass | undefined;
  readonly deletionProtectionEnabled: boolean | undefined;
}

/**
 * Refuse a request asking for more than one thing at a time.
 *
 * AWS takes one of these per call: change what the table is billed and
 * provisioned as, add one global secondary index, or remove one. A table class
 * or deletion protection change is not one of them and rides along with any of
 * them.
 */
function assertOneOperation(
  billing: SimDynamoDbTableBilling | undefined,
  indexUpdate: SimDynamoDbIndexUpdate,
): void {
  if (billing !== undefined && !indexUpdate.isEmpty) {
    throw new SimDynamoDbValidationException(
      "One or more parameter values were invalid: UpdateTable does one thing " +
        "at a time, and this request changes the table's throughput and a " +
        "global secondary index together",
    );
  }
}

/**
 * Refuse a request that asks for nothing.
 */
function assertAsksForSomething(
  properties: SimDynamoDbTableUpdateProperties,
): void {
  const asks =
    properties.billing !== undefined ||
    properties.indexCreated !== undefined ||
    properties.indexDeleted !== undefined ||
    properties.tableClass !== undefined ||
    properties.deletionProtectionEnabled !== undefined;

  if (!asks) {
    throw new SimDynamoDbValidationException(
      "An UpdateTable request changes the table's billing and throughput, " +
        "its global secondary indexes, its table class or its deletion " +
        "protection, and this one changes none of them",
    );
  }
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
  public readonly tableClass: SimDynamoDbTableClass | undefined;
  public readonly deletionProtectionEnabled: boolean | undefined;

  private constructor(properties: SimDynamoDbTableUpdateProperties) {
    assertAsksForSomething(properties);

    this.attributeDefinitions = properties.attributeDefinitions;
    this.billing = properties.billing;
    this.indexCreated = properties.indexCreated;
    this.indexDeleted = properties.indexDeleted;
    this.tableClass = properties.tableClass;
    this.deletionProtectionEnabled = properties.deletionProtectionEnabled;
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
    assertOneOperation(billing, indexUpdate);

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
      tableClass: readSimDynamoDbTableClass(input.TableClass),
      deletionProtectionEnabled: input.DeletionProtectionEnabled,
    });
  }
}
