import type { SimGlueDatabase } from "../../database/sim-glue-database.js";
import { definedEntries } from "../../../../util/record/defined-entries.js";
import type { SimGlueDatabaseDetail } from "./database.command.js";

/**
 * What GetDatabase and GetDatabases report about a database.
 */
export function simGlueDatabaseDetail(
  database: SimGlueDatabase,
): SimGlueDatabaseDetail {
  return definedEntries({
    Name: database.name,
    Description: database.description,
    LocationUri: database.locationUri,
    Parameters: database.parameters,
    CreateTime: database.createTime,
    CatalogId: database.catalogId,
  });
}
