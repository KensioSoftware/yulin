import type { SimGlueTable } from "../../table/sim-glue-table.js";
import { definedEntries } from "../../../../util/record/defined-entries.js";
import type { SimGlueTableDetail } from "./table.command.js";

/**
 * What GetTable and GetTables report about a table.
 *
 * Nothing updates a table yet, so the update time is the creation time.
 */
export function simGlueTableDetail(table: SimGlueTable): SimGlueTableDetail {
  return definedEntries({
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
  });
}
