import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

/**
 * The events a flattening query reads.
 *
 * Each holds a collection of every shape an `UNNEST` reaches. An array and a
 * map that are empty, a delimited string that is empty, and a row carrying no
 * delimited string at all, which is what a flattening answering no rows runs
 * over.
 */
const events = [
  {
    id: 1,
    tags: ["red", "blue"],
    attrs: { size: "large" },
    name: "one",
    packed: "red;blue",
  },
  { id: 2, tags: [], attrs: {}, name: "two", packed: "" },
  {
    id: 3,
    tags: ["green"],
    attrs: { size: "small", colour: "green" },
    name: "three",
  },
];

/** A simulation holding the events, with the engine on. */
export async function anEventSimulation(): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "events",
    columns: [
      { Name: "id", Type: "int" },
      { Name: "tags", Type: "array<string>" },
      { Name: "attrs", Type: "map<string,string>" },
      { Name: "name", Type: "string" },
      { Name: "packed", Type: "string" },
    ],
  });

  await aSeededJson(simulation.simAws, "events/part-0.json", events);
  await simulation.simAws.athena().engine().enable();
  simulation.simAws
    .athena()
    .results()
    .byDefault({ columns: ["fallback"], rows: [["declared"]] });

  return simulation;
}
