import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAthenaQueryEngine } from "../engine/sim-athena-query-engine.js";
import type { SimAthenaTableObjects } from "../engine/sim-athena-table-objects.js";
import type { SimAthenaQueryResults } from "../result/sim-athena-query-results.js";
import type { SimAthenaCatalog } from "../table/sim-athena-table-resolution.js";
import type { SimAthenaWorkGroupStore } from "../workgroup/sim-athena-work-group-store.js";
import type { SimAthenaResultWriter } from "./sim-athena-result-writer.js";
import type { SimAthenaScannedObjects } from "./sim-athena-scanned-objects.js";

/** What one query runner is built from. */
export interface SimAthenaQueryRunnerProperties {
  readonly results: SimAthenaQueryResults;
  readonly engine: SimAthenaQueryEngine;
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly writer: SimAthenaResultWriter;
  readonly background: BackgroundScheduler;

  /**
   * The Data Catalog a query's table names are resolved against.
   *
   * A SimAthena built on its own has none, and every query then runs without
   * its tables being looked for.
   */
  readonly catalog?: SimAthenaCatalog | undefined;

  /**
   * Where the objects a query reads are listed from.
   *
   * A SimAthena built on its own has none, and a query then scans whatever a
   * declaration says it scanned.
   */
  readonly objects?: SimAthenaScannedObjects | undefined;

  /**
   * Where the objects a query reads are opened from.
   *
   * Measuring a query needs only the listing. The engine needs the bytes, so
   * it is turned down wherever this is absent.
   */
  readonly tableObjects?: SimAthenaTableObjects | undefined;
}
