import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

const events = [
  { id: 1, tags: ["red", "blue"], attrs: { size: "large" }, name: "one" },
  { id: 2, tags: [], attrs: {}, name: "two" },
  {
    id: 3,
    tags: ["green"],
    attrs: { size: "small", colour: "green" },
    name: "three",
  },
];

/** A simulation holding the events, with the engine on. */
async function anEventSimulation(): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "events",
    columns: [
      { Name: "id", Type: "int" },
      { Name: "tags", Type: "array<string>" },
      { Name: "attrs", Type: "map<string,string>" },
      { Name: "name", Type: "string" },
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

describe("flattening an Athena array with UNNEST", () => {
  it("returns one row per element", async () => {
    // Given a table whose tags column holds an array.
    const simulation = await anEventSimulation();

    // When a query flattens it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT e.id, t.tag FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(e.tags) AS t(tag) ORDER BY e.id, t.tag",
    );

    // Then each element is a row of its own, the event holding none drops
    // out, and the column keeps the name the statement gave it.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["1", "blue"],
      ["1", "red"],
      ["3", "green"],
    ]);
    assertObjectEquals(answered.columns, ["integer", "varchar"]);
  });

  it("reaches the flattened column without its alias", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query names the flattened column on its own in a filter and a
    // sort as well as in the select list.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT e.id, tag FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(e.tags) AS t(tag) WHERE tag <> 'red' ORDER BY tag",
    );

    // Then every one of them reads the flattened value.
    assertObjectEquals(answered.rows, [
      ["1", "blue"],
      ["3", "green"],
    ]);
  });

  it("flattens a column the statement never qualified", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query names neither the table nor its alias.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT tag FROM rainlytics.events " +
        "CROSS JOIN UNNEST(tags) AS t(tag) ORDER BY tag",
    );

    // Then the one table the statement reads is what the column is looked for
    // on, the way Athena resolves it.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["blue"], ["green"], ["red"]]);
  });

  it("counts the elements from one with ORDINALITY", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query asks for each element's position.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT e.id, t.tag, t.place FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(e.tags) WITH ORDINALITY AS t(tag, place) " +
        "ORDER BY e.id, t.place",
    );

    // Then the first element is one rather than zero, which is how Athena
    // numbers it. SQLite numbers a JSON array's elements from zero.
    assertObjectEquals(answered.rows, [
      ["1", "red", "1"],
      ["1", "blue", "2"],
      ["3", "green", "1"],
    ]);
  });

  it("rolls the flattened rows up like any others", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query groups on the flattened column.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.tag, count(*) AS seen FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(e.tags) AS t(tag) GROUP BY t.tag ORDER BY t.tag",
    );

    // Then the rollup is over the elements rather than over the rows.
    assertObjectEquals(answered.rows, [
      ["blue", "1"],
      ["green", "1"],
      ["red", "1"],
    ]);
  });
});

describe("flattening an Athena map with UNNEST", () => {
  it("returns the key beside the value", async () => {
    // Given a table whose attrs column holds a map.
    const simulation = await anEventSimulation();

    // When a query flattens it into a pair.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT e.id, t.attribute, t.value FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(e.attrs) AS t(attribute, value) " +
        "ORDER BY e.id, t.attribute",
    );

    // Then each entry is a row carrying both halves.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["1", "size", "large"],
      ["3", "colour", "green"],
      ["3", "size", "small"],
    ]);
  });
});

describe("an UNNEST the engine turns down", () => {
  it("falls back over a column that is neither an array nor a map", async () => {
    // Given a scalar column.
    const simulation = await anEventSimulation();

    // When a query flattens it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.letter FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(e.name) AS t(letter)",
    );

    // Then the declaration answers it. The Glue schema is what says a column
    // holds a collection, and reading a scalar as one would answer with
    // whatever SQLite made of the text.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("falls back over a statement selecting every column", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query flattens an array and selects everything.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT * FROM rainlytics.events e CROSS JOIN UNNEST(e.tags) AS t(tag)",
    );

    // Then the declaration answers it. SQLite's own flattening carries eight
    // columns, and a result set holding those is worse than falling back.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("falls back over a position taken from a map", async () => {
    // Given a map column, with the engine on.
    const simulation = await anEventSimulation();

    // When a query asks a map for its positions.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.attribute FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(e.attrs) WITH ORDINALITY AS t(attribute, value, at)",
    );

    // Then the declaration answers it. SQLite gives a map's keys rather than
    // its positions, so there is nothing to count from.
    assertIdentical(answered.answeredBy, "declaration");
  });

  it("falls back over an expression the catalog says nothing about", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query flattens something that is not a column.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.part FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(split_part(e.name, 'n', 1)) AS t(part)",
    );

    // Then the declaration answers it. Only the schema says what a value
    // holds, and it says nothing about an expression.
    assertIdentical(answered.answeredBy, "declaration");
  });

  it("falls back over two flattenings in one statement", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query flattens twice.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT a.tag, b.attribute FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(e.tags) AS a(tag) " +
        "CROSS JOIN UNNEST(e.attrs) AS b(attribute, value)",
    );

    // Then the declaration answers it. One flattening is what this rewrites.
    assertIdentical(answered.answeredBy, "declaration");
  });

  it("falls back where the alias names no columns", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query gives the flattening an alias and no column name.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.tag FROM rainlytics.events e CROSS JOIN UNNEST(e.tags) AS t",
    );

    // Then the declaration answers it. Nothing says what to call the value.
    assertIdentical(answered.answeredBy, "declaration");
  });

  it("falls back where the alias names too many columns", async () => {
    // Given an array column, with the engine on.
    const simulation = await anEventSimulation();

    // When a query names two columns for it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.one, t.two FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(e.tags) AS t(one, two)",
    );

    // Then the declaration answers it. An array flattens to one column, and a
    // map is what flattens to two.
    assertIdentical(answered.answeredBy, "declaration");
  });

  it("falls back over a column the table never declared", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query flattens a column the schema has never heard of.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.x FROM rainlytics.events e CROSS JOIN UNNEST(e.absent) AS t(x)",
    );

    // Then the declaration answers it.
    assertIdentical(answered.answeredBy, "declaration");
  });

  it("falls back over a flattening that is not a cross join", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query flattens under a left join.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT e.id, t.tag FROM rainlytics.events e " +
        "LEFT JOIN UNNEST(e.tags) AS t(tag) ON TRUE",
    );

    // Then the declaration answers it. SQLite reaches a flattening through a
    // comma, which is a cross join and keeps no unmatched row.
    assertIdentical(answered.answeredBy, "declaration");
  });
});
