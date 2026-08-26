import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { requiredSimGlueName } from "../../database/sim-glue-catalog-name.js";
import type { SimGlueDatabaseStore } from "../../database/sim-glue-database-store.js";
import { simGluePartitionExpressionFilter } from "../../expression/sim-glue-partition-expression.js";
import type { SimGluePartition } from "../../partition/sim-glue-partition.js";
import type { SimGluePartitionStore } from "../../partition/sim-glue-partition-store.js";
import type { SimGlueTablePartitions } from "../../partition/sim-glue-table-partitions.js";
import { requiredSimGluePartitionValues } from "../../partition/sim-glue-partition-values.js";
import type { SimGlueTable } from "../../table/sim-glue-table.js";
import type { SimGlueTableStore } from "../../table/sim-glue-table-store.js";
import { requiredSimGlueStorageDescriptor } from "../../table/sim-glue-table-input-shape.js";
import type { SimGlueAuthorizer } from "../authorize/sim-glue-authorizer.js";
import { requireSimGlueCatalogId } from "../sim-glue-catalog-id.js";
import type { SimGlueRequestOptions } from "../sim-glue-request-options.js";
import type { SimGluePartitionInputShape } from "./partition.command.js";

/** What every partition command names the table it works on with. */
export interface SimGluePartitionTableRequest {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
  readonly TableName?: string | undefined;
}

interface SimGluePartitionRegistryProperties {
  readonly databases: SimGlueDatabaseStore;
  readonly tables: SimGlueTableStore;
  readonly partitions: SimGluePartitionStore;
  readonly authorizer: SimGlueAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * The work every partition command does, whether it handles one partition or
 * a batch of them.
 *
 * A batch entry has to fail the way a single request fails, since a batch
 * reports the refusal it would otherwise have thrown. Keeping both on one path
 * is what makes those two agree.
 */
export class SimGluePartitionRegistry {
  readonly #databases: SimGlueDatabaseStore;
  readonly #tables: SimGlueTableStore;
  readonly #partitions: SimGluePartitionStore;
  readonly #authorizer: SimGlueAuthorizer;
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #clock: SimClock;

  constructor(properties: SimGluePartitionRegistryProperties) {
    this.#databases = properties.databases;
    this.#tables = properties.tables;
    this.#partitions = properties.partitions;
    this.#authorizer = properties.authorizer;
    this.#accountRegionScope = properties.accountRegionScope;
    this.#clock = properties.clock;
  }

  /**
   * Authorize against the table a request names, and get it.
   *
   * The table has to be there. Real Glue answers `EntityNotFoundException` for
   * a partition command naming a table that is absent, rather than making one.
   *
   * A partition has no ARN of its own, so the table ARN is what a real Glue
   * policy grants partition actions on, and what this authorizes.
   */
  requireTable(
    action: string,
    input: SimGluePartitionTableRequest,
    options: SimGlueRequestOptions | undefined,
  ): SimGlueTable {
    requireSimGlueCatalogId(this.#accountRegionScope, input.CatalogId);

    const databaseName = requiredSimGlueName(
      "DatabaseName",
      input.DatabaseName,
    );
    const tableName = requiredSimGlueName("TableName", input.TableName);

    this.#authorizer.authorizeTable(
      action,
      databaseName,
      tableName,
      options?.caller,
    );

    this.#databases.require(databaseName);

    return this.#tables.require(databaseName, tableName);
  }

  /** Register one partition against a table. */
  create(
    table: SimGlueTable,
    label: string,
    input: SimGluePartitionInputShape,
  ): void {
    const values = requiredSimGluePartitionValues(
      `${label}.Values`,
      table,
      input.Values,
    );

    this.#of(table).create(values, this.#clock.now(), {
      lastAccessTime: input.LastAccessTime,
      lastAnalyzedTime: input.LastAnalyzedTime,
      storageDescriptor: requiredSimGlueStorageDescriptor(
        `${label}.StorageDescriptor`,
        input.StorageDescriptor,
      ),
      parameters: input.Parameters,
    });
  }

  /** Remove one partition, refusing values nothing is registered under. */
  remove(
    table: SimGlueTable,
    label: string,
    declared: readonly string[] | undefined,
  ): void {
    const values = requiredSimGluePartitionValues(label, table, declared);
    const partitions = this.#of(table);

    partitions.require(values);
    partitions.delete(values);
  }

  /** Get one partition by its values, refusing one that is absent. */
  require(
    table: SimGlueTable,
    label: string,
    declared: readonly string[] | undefined,
  ): SimGluePartition {
    return this.#of(table).require(
      requiredSimGluePartitionValues(label, table, declared),
    );
  }

  /** Every partition of one table, in registration order. */
  inTable(table: SimGlueTable): readonly SimGluePartition[] {
    return this.#of(table).all;
  }

  /**
   * Every partition of one table an `Expression` matches.
   *
   * The expression is read against the table, since which names are partition
   * keys and how each one's values are ordered are properties of the table
   * rather than of the expression.
   */
  matching(
    table: SimGlueTable,
    expression: string | undefined,
  ): readonly SimGluePartition[] {
    const partitions = this.inTable(table);

    if (expression === undefined) {
      return partitions;
    }

    const holds = simGluePartitionExpressionFilter(
      expression,
      table.partitionKeys,
    );

    return partitions.filter((partition) => holds(partition.values));
  }

  #of(table: SimGlueTable): SimGlueTablePartitions {
    return this.#partitions.inTable(table.databaseName, table.name);
  }
}
