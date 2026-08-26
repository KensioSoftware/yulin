import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimGlueStorageDescriptor } from "../../table/sim-glue-table-schema.js";
import type { SimGlueStorageDescriptorInput } from "../../table/sim-glue-table-input-shape.js";

/**
 * What a caller registers a partition with.
 *
 * `Values` lines up with the table's `PartitionKeys` in the order those were
 * declared, and `StorageDescriptor.Location` is where this partition's own
 * data sits.
 *
 * https://docs.aws.amazon.com/glue/latest/webapi/API_PartitionInput.html
 */
export interface SimGluePartitionInputShape {
  readonly Values?: readonly string[] | undefined;
  readonly LastAccessTime?: Date | undefined;
  readonly LastAnalyzedTime?: Date | undefined;
  readonly StorageDescriptor?: SimGlueStorageDescriptorInput | undefined;
  readonly Parameters?: Readonly<Record<string, string>> | undefined;
}

/** The values naming one partition, as a batch delete lists them. */
export interface SimGluePartitionValueListShape {
  readonly Values?: readonly string[] | undefined;
}

/**
 * What GetPartition reports about one partition.
 */
export interface SimGluePartitionDetail {
  readonly Values: readonly string[];
  readonly DatabaseName: string;
  readonly TableName: string;
  readonly CreationTime: Date;
  readonly LastAccessTime?: Date | undefined;
  readonly LastAnalyzedTime?: Date | undefined;
  readonly StorageDescriptor?: SimGlueStorageDescriptor | undefined;
  readonly Parameters: Readonly<Record<string, string>>;
  readonly CatalogId: string;
}

/** Why one entry of a batch failed. */
export interface SimGlueErrorDetail {
  readonly ErrorCode: string;
  readonly ErrorMessage: string;
}

/**
 * One partition a batch could not make or remove, and why.
 *
 * A batch reports these rather than failing, so a caller registering a day's
 * partitions learns which ones were already there without losing the rest.
 */
export interface SimGluePartitionError {
  readonly PartitionValues: readonly string[];
  readonly ErrorDetail: SimGlueErrorDetail;
}

/**
 * Minimal structural sim Glue CreatePartition command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/CreatePartitionCommand/
 */
export interface SimCreatePartitionCommand {
  readonly input: SimCreatePartitionCommandInput;
}

export interface SimCreatePartitionCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
  readonly TableName?: string | undefined;
  readonly PartitionInput?: SimGluePartitionInputShape | undefined;
}

export interface SimCreatePartitionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue BatchCreatePartition command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/BatchCreatePartitionCommand/
 */
export interface SimBatchCreatePartitionCommand {
  readonly input: SimBatchCreatePartitionCommandInput;
}

export interface SimBatchCreatePartitionCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
  readonly TableName?: string | undefined;
  readonly PartitionInputList?:
    | readonly SimGluePartitionInputShape[]
    | undefined;
}

export interface SimBatchCreatePartitionCommandOutput {
  readonly Errors: readonly SimGluePartitionError[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue GetPartition command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/GetPartitionCommand/
 */
export interface SimGetPartitionCommand {
  readonly input: SimGetPartitionCommandInput;
}

export interface SimGetPartitionCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
  readonly TableName?: string | undefined;
  readonly PartitionValues?: readonly string[] | undefined;
}

export interface SimGetPartitionCommandOutput {
  readonly Partition: SimGluePartitionDetail;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue GetPartitions command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/GetPartitionsCommand/
 */
export interface SimGetPartitionsCommand {
  readonly input: SimGetPartitionsCommandInput;
}

export interface SimGetPartitionsCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
  readonly TableName?: string | undefined;
  readonly Expression?: string | undefined;
}

export interface SimGetPartitionsCommandOutput {
  readonly Partitions: readonly SimGluePartitionDetail[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue DeletePartition command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/DeletePartitionCommand/
 */
export interface SimDeletePartitionCommand {
  readonly input: SimDeletePartitionCommandInput;
}

export interface SimDeletePartitionCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
  readonly TableName?: string | undefined;
  readonly PartitionValues?: readonly string[] | undefined;
}

export interface SimDeletePartitionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue BatchDeletePartition command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/BatchDeletePartitionCommand/
 */
export interface SimBatchDeletePartitionCommand {
  readonly input: SimBatchDeletePartitionCommandInput;
}

export interface SimBatchDeletePartitionCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseName?: string | undefined;
  readonly TableName?: string | undefined;
  readonly PartitionsToDelete?:
    | readonly SimGluePartitionValueListShape[]
    | undefined;
}

export interface SimBatchDeletePartitionCommandOutput {
  readonly Errors: readonly SimGluePartitionError[];
  readonly $metadata: SimResponseMetadata;
}
