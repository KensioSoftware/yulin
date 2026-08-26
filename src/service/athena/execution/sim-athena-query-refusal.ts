import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";
import {
  simAthenaTableRefusal,
  type SimAthenaCatalog,
} from "../table/sim-athena-table-resolution.js";
import type { SimAthenaWorkGroupStore } from "../workgroup/sim-athena-work-group-store.js";
import type { SimAthenaQueryExecution } from "./sim-athena-query-execution.js";

interface SimAthenaQueryRefusalProperties {
  readonly execution: SimAthenaQueryExecution;
  readonly result: SimAthenaResolvedResult;
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly catalog: SimAthenaCatalog | undefined;
}

/**
 * Why a query cannot answer, where something says it cannot.
 *
 * Three things can refuse one, and they are asked in the order real Athena
 * would reach them. A declaration saying the query fails wins, because that is
 * a test's own statement about the query. Then the tables it names are looked
 * for in the Data Catalog, the way Athena resolves them before running
 * anything. The cutoff is last, against what the declaration says the query
 * scanned.
 */
export function simAthenaQueryRefusal(
  properties: SimAthenaQueryRefusalProperties,
): string | undefined {
  const { execution, result } = properties;

  if (result.failsWith !== undefined) {
    return result.failsWith;
  }

  const absentTable = simAthenaTableRefusal(
    {
      queryString: execution.queryString,
      database: execution.database,
      catalog: execution.catalog,
    },
    properties.catalog,
  );

  return absentTable ?? cutoffRefusal(properties);
}

/**
 * The cost guardrail, checked against what the declaration says the query
 * scanned.
 *
 * That is the whole of it, and the one thing this simulation can enforce for
 * real without a query engine.
 */
function cutoffRefusal(
  properties: SimAthenaQueryRefusalProperties,
): string | undefined {
  const { execution, result } = properties;
  const cutoff = properties.workGroups.find(
    execution.workGroupName,
  )?.bytesScannedCutoffPerQuery;

  if (cutoff === undefined || result.bytesScanned <= cutoff) {
    return undefined;
  }

  return (
    `Bytes scanned limit was exceeded. The query scanned ` +
    `${String(result.bytesScanned)} bytes, and workgroup ` +
    `${execution.workGroupName} allows ${String(cutoff)} per query.`
  );
}
