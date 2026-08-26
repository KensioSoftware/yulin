import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimGluePartition } from "./sim-glue-partition.js";
import { simGluePartitionKey } from "./sim-glue-partition-key.js";
import {
  refuseSimGluePartitionInPlace,
  requireSimGluePartitionFound,
} from "./sim-glue-partition-refusal.js";
import type { SimGluePartitionInput } from "./sim-glue-partition-schema.js";

interface SimGlueTablePartitionsProperties {
  readonly databaseName: string;
  readonly tableName: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The registered partitions of one simulated Glue table.
 *
 * Each is held under its own values, which are the whole of a partition's
 * identity within its table. Two tables may each hold a partition of the same
 * values, since each table has one of these to itself.
 */
export class SimGlueTablePartitions {
  readonly #databaseName: string;
  readonly #tableName: string;
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #partitions = new Map<string, SimGluePartition>();

  constructor(properties: SimGlueTablePartitionsProperties) {
    this.#databaseName = properties.databaseName;
    this.#tableName = properties.tableName;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /** Every partition of this table, in registration order. */
  get all(): readonly SimGluePartition[] {
    return this.#partitions.values().toArray();
  }

  /**
   * Register a partition, refusing values already registered here.
   */
  create(
    values: readonly string[],
    creationTime: Date,
    input: SimGluePartitionInput,
  ): SimGluePartition {
    refuseSimGluePartitionInPlace(this.find(values), this.#label(values));

    const partition = new SimGluePartition({
      values,
      databaseName: this.#databaseName,
      tableName: this.#tableName,
      accountRegionScope: this.#accountRegionScope,
      creationTime,
      ...input,
    });

    this.#partitions.set(partition.key, partition);

    return partition;
  }

  /** Find a partition by its values. */
  find(values: readonly string[]): SimGluePartition | undefined {
    return this.#partitions.get(simGluePartitionKey(values));
  }

  /** Get a partition by its values, refusing one that is absent. */
  require(values: readonly string[]): SimGluePartition {
    return requireSimGluePartitionFound(this.find(values), this.#label(values));
  }

  /** Remove a partition. */
  delete(values: readonly string[]): void {
    this.#partitions.delete(simGluePartitionKey(values));
  }

  #label(values: readonly string[]): string {
    return `${this.#databaseName}.${this.#tableName} ${simGluePartitionKey(values)}`;
  }
}
