import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";
import { SimAthenaProjectionError } from "../projection/sim-athena-projection-error.js";
import {
  simAthenaTablePartitions,
  type SimAthenaPartitionedTable,
} from "../projection/sim-athena-table-partitions.js";
import {
  simAthenaResolveTables,
  type SimAthenaCatalog,
} from "../table/sim-athena-table-resolution.js";
import type { SimAthenaWorkGroupStore } from "../workgroup/sim-athena-work-group-store.js";
import type { SimAthenaQueryExecution } from "./sim-athena-query-execution.js";

interface SimAthenaQueryRefusalProperties {
  readonly execution: SimAthenaQueryExecution;
  readonly result: SimAthenaResolvedResult;
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly catalog: SimAthenaCatalog | undefined;

  /** What the simulated clock reads, for a projection bound written `NOW`. */
  readonly now: Date;
}

/**
 * Why a query cannot answer, where something says it cannot.
 *
 * Four things can refuse one, and they are asked in the order real Athena
 * would reach them. A declaration saying the query fails wins, because that is
 * a test's own statement about the query. Then the tables it names are looked
 * for in the Data Catalog, and each one's partition projection is expanded,
 * both of which Athena does while planning. The cutoff is last, against what
 * the declaration says the query scanned.
 */
export function simAthenaQueryRefusal(
  properties: SimAthenaQueryRefusalProperties,
): string | undefined {
  const { execution, result } = properties;

  if (result.failsWith !== undefined) {
    return result.failsWith;
  }

  const resolved = simAthenaResolveTables(
    {
      queryString: execution.queryString,
      database: execution.database,
      catalog: execution.catalog,
    },
    properties.catalog,
  );

  if (resolved.refusal !== undefined) {
    return resolved.refusal;
  }

  return (
    projectionRefusal(properties, resolved.tables) ?? cutoffRefusal(properties)
  );
}

/**
 * Why a table's partition projection cannot be read.
 *
 * Glue accepts any parameters it is given, so a projection with a mistake in
 * it is found here, when a query first asks what partitions the table has.
 */
function projectionRefusal(
  properties: SimAthenaQueryRefusalProperties,
  tables: readonly SimAthenaPartitionedTable[],
): string | undefined {
  for (const table of tables) {
    try {
      simAthenaTablePartitions({
        table,
        queryString: properties.execution.queryString,
        now: properties.now,
      });
    } catch (error) {
      if (error instanceof SimAthenaProjectionError) {
        return error.message;
      }

      throw error;
    }
  }

  return undefined;
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
