import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

/**
 * A table of snapshots partitioned by a string `day`, with the engine on and
 * a default declaration that a fallback would answer with.
 *
 * `taken_at` is a Glue `timestamp` written as ISO-8601 with a `T` and a `Z`.
 * `noted_at` is a `string` holding a timestamp the way Trino's cast from text
 * reads one.
 */
export async function aSnapshotSimulation(): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "snapshots",
    columns: [
      { Name: "sku", Type: "string" },
      { Name: "taken_at", Type: "timestamp" },
      { Name: "noted_at", Type: "string" },
    ],
    partitionKeys: [{ Name: "day", Type: "string" }],
  });

  await aSeededJson(simulation.simAws, "snapshots/day=2026-08-15/part-0.json", [
    {
      sku: "bolt",
      taken_at: "2026-08-15T23:30:00Z",
      noted_at: "2026-08-15 10:00:00",
    },
    {
      sku: "nut",
      taken_at: "2026-08-14T08:00:00Z",
      noted_at: "2026-08-14 09:15:00.5",
    },
  ]);
  await simulation.simAws.athena().engine().enable();
  simulation.simAws
    .athena()
    .results()
    .byDefault({ columns: ["fallback"], rows: [["declared"]] });

  return simulation;
}
