import type { SimGlueStorageDescriptor } from "../table/sim-glue-table-schema.js";

/** What a partition is created with, beyond its values. */
export interface SimGluePartitionInput {
  readonly lastAccessTime?: Date | undefined;
  readonly lastAnalyzedTime?: Date | undefined;
  readonly storageDescriptor?: SimGlueStorageDescriptor | undefined;
  readonly parameters?: Readonly<Record<string, string>> | undefined;
}
