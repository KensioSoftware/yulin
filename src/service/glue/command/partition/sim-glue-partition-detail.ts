import { definedEntries } from "../../../../util/record/defined-entries.js";
import type { SimGluePartition } from "../../partition/sim-glue-partition.js";
import type { SimGluePartitionDetail } from "./partition.command.js";

/**
 * What GetPartition and GetPartitions report about a partition.
 *
 * The result is detached from the stored partition, as a table's detail is.
 * Real Glue answers each request with its own object, and a caller holding a
 * reference into the catalog could otherwise change a registration without a
 * command or the permission to make one.
 */
export function simGluePartitionDetail(
  partition: SimGluePartition,
): SimGluePartitionDetail {
  return structuredClone(
    definedEntries({
      Values: partition.values,
      DatabaseName: partition.databaseName,
      TableName: partition.tableName,
      CreationTime: partition.creationTime,
      LastAccessTime: partition.lastAccessTime,
      LastAnalyzedTime: partition.lastAnalyzedTime,
      StorageDescriptor: partition.storageDescriptor,
      Parameters: partition.parameters,
      CatalogId: partition.catalogId,
    }),
  );
}
