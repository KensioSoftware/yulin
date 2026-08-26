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

/** What planning one query came to. */
export interface SimAthenaQueryPlan {
  /** Why the query cannot run, where something says it cannot. */
  readonly refusal: string | undefined;

  /** The S3 prefixes the query reads, for measuring what it scans. */
  readonly prefixes: readonly string[];
}

interface SimAthenaQueryRefusalProperties {
  readonly execution: SimAthenaQueryExecution;
  readonly result: SimAthenaResolvedResult;
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly catalog: SimAthenaCatalog | undefined;

  /** What the simulated clock reads, for a projection bound written `NOW`. */
  readonly now: Date;
}

/**
 * Plan one query, the way Athena plans one before it runs.
 *
 * A declaration saying the query fails wins, because that is a test's own
 * statement about the query. Then the tables it names are looked for in the
 * Data Catalog and each one's partition projection is expanded, which is what
 * produces the prefixes the query reads.
 *
 * The cutoff is checked after this, against what those prefixes hold.
 */
export function simAthenaPlanQuery(
  properties: SimAthenaQueryRefusalProperties,
): SimAthenaQueryPlan {
  const { execution, result } = properties;

  if (result.failsWith !== undefined) {
    return { refusal: result.failsWith, prefixes: [] };
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
    return { refusal: resolved.refusal, prefixes: [] };
  }

  return partitionsOf(properties, resolved.tables);
}

/**
 * The prefixes every table a query names comes to.
 *
 * Glue accepts any projection parameters it is given, so a projection with a
 * mistake in it is found here, when a query first asks what partitions the
 * table has.
 */
function partitionsOf(
  properties: SimAthenaQueryRefusalProperties,
  tables: readonly SimAthenaPartitionedTable[],
): SimAthenaQueryPlan {
  const prefixes: string[] = [];

  for (const table of tables) {
    try {
      prefixes.push(
        ...simAthenaTablePartitions({
          table,
          queryString: properties.execution.queryString,
          now: properties.now,
        }),
      );
    } catch (error) {
      if (error instanceof SimAthenaProjectionError) {
        return { refusal: error.message, prefixes: [] };
      }

      throw error;
    }
  }

  return { refusal: undefined, prefixes };
}

/**
 * The cost guardrail, checked against what the query scanned.
 *
 * The figure comes from the objects under the prefixes the query reads, or
 * from a declaration where a test wrote one down.
 */
export function simAthenaCutoffRefusal(
  execution: SimAthenaQueryExecution,
  bytesScanned: number,
  workGroups: SimAthenaWorkGroupStore,
): string | undefined {
  const cutoff = workGroups.find(
    execution.workGroupName,
  )?.bytesScannedCutoffPerQuery;

  if (cutoff === undefined || bytesScanned <= cutoff) {
    return undefined;
  }

  return (
    `Bytes scanned limit was exceeded. The query scanned ` +
    `${String(bytesScanned)} bytes, and workgroup ` +
    `${execution.workGroupName} allows ${String(cutoff)} per query.`
  );
}
