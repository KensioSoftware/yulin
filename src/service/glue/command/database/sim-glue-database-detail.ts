import type { SimGlueDatabase } from "../../database/sim-glue-database.js";
import { definedEntries } from "../../../../util/record/defined-entries.js";
import type { SimGlueDatabaseDetail } from "./database.command.js";

/**
 * What GetDatabase and GetDatabases report about a database.
 *
 * The result is detached from the stored database, for the reason
 * `simGlueTableDetail` gives.
 */
export function simGlueDatabaseDetail(
  database: SimGlueDatabase,
): SimGlueDatabaseDetail {
  return structuredClone(
    definedEntries({
      Name: database.name,
      Description: database.description,
      LocationUri: database.locationUri,
      Parameters: database.parameters,
      CreateTime: database.createTime,
      CatalogId: database.catalogId,
    }),
  );
}
