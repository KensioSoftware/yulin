import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simGlueTableArn } from "../arn/sim-glue-arn.js";
import type {
  SimGlueColumn,
  SimGlueStorageDescriptor,
} from "./sim-glue-table-schema.js";

interface SimGlueTableProperties {
  readonly name: string;
  readonly databaseName: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createTime: Date;
  readonly description?: string | undefined;
  readonly owner?: string | undefined;
  readonly retention?: number | undefined;
  readonly tableType?: string | undefined;
  readonly partitionKeys?: readonly SimGlueColumn[] | undefined;
  readonly storageDescriptor?: SimGlueStorageDescriptor | undefined;
  readonly parameters?: Readonly<Record<string, string>> | undefined;
}

/**
 * A simulated Glue table, which is a definition of a dataset rather than the
 * dataset itself.
 *
 * The parameters are the part callers most often care about here. Athena
 * partition projection lives entirely in them, so a table whose parameters
 * were dropped on the way in looks created while configuring nothing.
 */
export class SimGlueTable {
  readonly name: string;
  readonly databaseName: string;
  readonly createTime: Date;
  readonly description: string | undefined;
  readonly owner: string | undefined;
  readonly retention: number | undefined;
  readonly tableType: string | undefined;
  readonly partitionKeys: readonly SimGlueColumn[];
  readonly storageDescriptor: SimGlueStorageDescriptor | undefined;
  readonly parameters: Readonly<Record<string, string>>;

  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimGlueTableProperties) {
    this.name = properties.name;
    this.databaseName = properties.databaseName;
    this.createTime = properties.createTime;
    this.description = properties.description;
    this.owner = properties.owner;
    this.retention = properties.retention;
    this.tableType = properties.tableType;
    this.partitionKeys = [...(properties.partitionKeys ?? [])];
    this.storageDescriptor = properties.storageDescriptor;
    this.parameters = { ...properties.parameters };
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /** The catalog holding this table, which is the account id. */
  get catalogId(): string {
    return this.#accountRegionScope.accountId;
  }

  /** This table's ARN, which names the database holding it. */
  get arn(): string {
    return simGlueTableArn(
      this.#accountRegionScope,
      this.databaseName,
      this.name,
    );
  }

  /**
   * The data columns, which exclude the partition keys.
   *
   * Real Glue keeps the two apart, and a partition key repeated in the
   * storage descriptor's columns is how a table ends up with a duplicate
   * column that Athena then refuses to query.
   */
  get columns(): readonly SimGlueColumn[] {
    return this.storageDescriptor?.Columns ?? [];
  }
}
