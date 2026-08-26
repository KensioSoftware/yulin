import type { SimAws } from "../aws/sim-aws.js";
import {
  aCatalogTable,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

/**
 * Register one partition against a table in the `rainlytics` database.
 *
 * A partition given no location of its own falls back to the Hive layout
 * under its table's, the way Athena resolves one.
 */
export function aRegisteredPartition(
  simAws: SimAws,
  tableName: string,
  values: readonly string[],
  location?: string,
): void {
  simAws.glue().createPartition({
    input: {
      DatabaseName: "rainlytics",
      TableName: tableName,
      PartitionInput: {
        Values: values,
        ...(location !== undefined && {
          StorageDescriptor: { Location: location },
        }),
      },
    },
  });
}

/**
 * Declare a `stock` table partitioned by day, holding one column.
 *
 * Every registered partition test wants the same table, and what differs
 * between them is what is registered against it.
 */
export function aStockTable(
  simulation: SimAthenaEngineSimulation,
  parameters: Record<string, string> = {},
): void {
  aCatalogTable(simulation.simAws, {
    name: "stock",
    columns: [{ Name: "sku", Type: "string" }],
    partitionKeys: [{ Name: "day", Type: "string" }],
    parameters,
  });
}

/** Register one partition of that `stock` table. */
export function aStockPartition(
  simulation: SimAthenaEngineSimulation,
  values: readonly string[],
  location?: string,
): void {
  aRegisteredPartition(simulation.simAws, "stock", values, location);
}
