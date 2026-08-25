import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimGlueColumn,
  SimGlueStorageDescriptor,
} from "../../table/sim-glue-table-schema.js";
import type {
  SimGlueColumnInput,
  SimGlueStorageDescriptorInput,
} from "../../table/sim-glue-table-input-shape.js";

/**
 * What a caller declares a table with.
 *
 * `Parameters` is where Athena partition projection lives, so it is the field
 * a caller is most likely to be asserting on.
 *
 * https://docs.aws.amazon.com/glue/latest/webapi/API_TableInput.html
 */
export interface SimGlueTableInputShape {
  readonly Name?: string | undefined;
  readonly Description?: string | undefined;
  readonly Owner?: string | undefined;
  readonly Retention?: number | undefined;
  readonly TableType?: string | undefined;
  readonly PartitionKeys?: readonly SimGlueColumnInput[] | undefined;
  readonly StorageDescriptor?: SimGlueStorageDescriptorInput | undefined;
  readonly Parameters?: Readonly<Record<string, string>> | undefined;
}

/**
 * What GetTable reports about one table.
 */
export interface SimGlueTableDetail {
  readonly Name: string;
  readonly DatabaseName: string;
  readonly Description?: string | undefined;
  readonly Owner?: string | undefined;
  readonly Retention?: number | undefined;
  readonly TableType?: string | undefined;
  readonly PartitionKeys: readonly SimGlueColumn[];
  readonly StorageDescriptor?: SimGlueStorageDescriptor | undefined;
  readonly Parameters: Readonly<Record<string, string>>;
  readonly CreateTime: Date;
  readonly UpdateTime: Date;
  readonly CatalogId: string;
}

/**
 * Minimal structural sim Glue CreateTable command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/CreateTableCommand/
 */
export interface SimCreateTableCommand {
  readonly input: SimCreateTableCommandInput;
}

export interface SimCreateTableCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
  readonly Name?: string | undefined;
  readonly TableInput?: SimGlueTableInputShape | undefined;
}

export interface SimCreateTableCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue GetTable command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/GetTableCommand/
 */
export interface SimGetTableCommand {
  readonly input: SimGetTableCommandInput;
}

export interface SimGetTableCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
  readonly Name?: string | undefined;
}

export interface SimGetTableCommandOutput {
  readonly Table: SimGlueTableDetail;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue GetTables command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/GetTablesCommand/
 */
export interface SimGetTablesCommand {
  readonly input: SimGetTablesCommandInput;
}

export interface SimGetTablesCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
}

export interface SimGetTablesCommandOutput {
  readonly TableList: readonly SimGlueTableDetail[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue DeleteTable command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/DeleteTableCommand/
 */
export interface SimDeleteTableCommand {
  readonly input: SimDeleteTableCommandInput;
}

export interface SimDeleteTableCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
  readonly Name?: string | undefined;
}

export interface SimDeleteTableCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
