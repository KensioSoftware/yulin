import type { SimGlueTable } from "../../table/sim-glue-table.js";
import { definedEntries } from "../../../../util/record/defined-entries.js";
import type { SimGlueTableDetail } from "./table.command.js";

/**
 * What GetTable and GetTables report about a table.
 *
 * Nothing updates a table yet, so the update time is the creation time.
 *
 * The result is detached from the stored table. Real Glue answers each request
 * with its own object, and a caller holding a reference into the catalog could
 * otherwise change a definition without a command or the permission to make
 * one.
 */
export function simGlueTableDetail(table: SimGlueTable): SimGlueTableDetail {
  return structuredClone(
    definedEntries({
      Name: table.name,
      DatabaseName: table.databaseName,
      Description: table.description,
      Owner: table.owner,
      Retention: table.retention,
      TableType: table.tableType,
      PartitionKeys: table.partitionKeys,
      StorageDescriptor: table.storageDescriptor,
      Parameters: table.parameters,
      CreateTime: table.createTime,
      UpdateTime: table.createTime,
      CatalogId: table.catalogId,
    }),
  );
}
