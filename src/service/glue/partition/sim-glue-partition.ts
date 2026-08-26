import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimGlueStorageDescriptor } from "../table/sim-glue-table-schema.js";
import { simGluePartitionKey } from "./sim-glue-partition-key.js";

interface SimGluePartitionProperties {
  readonly values: readonly string[];
  readonly databaseName: string;
  readonly tableName: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly creationTime: Date;
  readonly lastAccessTime?: Date | undefined;
  readonly lastAnalyzedTime?: Date | undefined;
  readonly storageDescriptor?: SimGlueStorageDescriptor | undefined;
  readonly parameters?: Readonly<Record<string, string>> | undefined;
}

/**
 * One registered partition of a simulated Glue table.
 *
 * The values are positional. They line up with the table's `PartitionKeys` in
 * the order those were declared, which is why a partition carries no key names
 * of its own.
 *
 * The storage descriptor is the part callers most often care about. A
 * registered partition says where its own data sits, and that location need
 * not sit under the table's.
 *
 * Everything a caller declared is copied on the way in, as a table's
 * definition is, so a `PartitionInput` the caller goes on to reuse cannot keep
 * changing what the catalog holds.
 */
export class SimGluePartition {
  readonly values: readonly string[];
  readonly databaseName: string;
  readonly tableName: string;
  readonly creationTime: Date;
  readonly lastAccessTime: Date | undefined;
  readonly lastAnalyzedTime: Date | undefined;
  readonly storageDescriptor: SimGlueStorageDescriptor | undefined;
  readonly parameters: Readonly<Record<string, string>>;

  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimGluePartitionProperties) {
    this.values = [...properties.values];
    this.databaseName = properties.databaseName;
    this.tableName = properties.tableName;
    this.creationTime = new Date(properties.creationTime);
    this.lastAccessTime = optionalDate(properties.lastAccessTime);
    this.lastAnalyzedTime = optionalDate(properties.lastAnalyzedTime);
    this.storageDescriptor = structuredClone(properties.storageDescriptor);
    this.parameters = structuredClone(properties.parameters) ?? {};
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /** The catalog holding this partition, which is the account id. */
  get catalogId(): string {
    return this.#accountRegionScope.accountId;
  }

  /** The key this partition is held under within its table. */
  get key(): string {
    return simGluePartitionKey(this.values);
  }
}

function optionalDate(value: Date | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}
