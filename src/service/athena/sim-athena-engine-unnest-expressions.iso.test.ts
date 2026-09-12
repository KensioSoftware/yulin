import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import { anEventSimulation } from "./sim-athena-flattened-events.fixture.js";

describe("flattening an Athena expression with UNNEST", () => {
  it("returns one row per element of a split value", async () => {
    // Given a table whose packed column holds a delimited string.
    const simulation = await anEventSimulation();

    // When a query cuts it up and flattens the result.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT e.id, t.part FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(split(e.packed, ';')) AS t(part) " +
        "ORDER BY e.id, t.part",
    );

    // Then each part is a row of its own. The empty value answers one empty
    // part the way Trino does, and the event holding no value at all drops
    // out, since there is nothing to flatten.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["1", "blue"],
      ["1", "red"],
      ["2", ""],
    ]);
  });

  it("counts the rows the flattening left in the pass", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query rolls the parts up by event.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT e.id, count(*) AS parts FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(split(e.packed, ';')) AS t(part) " +
        "GROUP BY e.id ORDER BY e.id",
    );

    // Then the event whose value answered no parts is counted nowhere, and
    // the others are counted as the parts they came to.
    assertObjectEquals(answered.rows, [
      ["1", "2"],
      ["2", "1"],
    ]);
  });

  it("counts the parts from one with ORDINALITY", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query asks each part for its position.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.part, t.place FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(split(e.packed, ';')) WITH ORDINALITY AS " +
        "t(part, place) WHERE e.id = 1 ORDER BY t.place",
    );

    // Then the positions run over the parts the split answered with.
    assertObjectEquals(answered.rows, [
      ["red", "1"],
      ["blue", "2"],
    ]);
  });

  it("flattens what a whole expression tree comes to", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query reads the parts out of a query string it builds itself,
    // which is the shape a packed access log row is read with.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.part FROM rainlytics.events e CROSS JOIN UNNEST(split(" +
        "url_extract_parameter('https://rain.example/r?b=' || e.packed, 'b')" +
        ", ';')) AS t(part) WHERE e.id = 1 ORDER BY t.part",
    );

    // Then the call the flattening names is what decides, however much sits
    // underneath it.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["blue"], ["red"]]);
  });

  it("flattens a run taken out of an array column", async () => {
    // Given the events, with the engine on.
    const simulation = await anEventSimulation();

    // When a query flattens part of an array rather than all of it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.tag FROM rainlytics.events e " +
        "CROSS JOIN UNNEST(slice(e.tags, 2, 1)) AS t(tag)",
    );

    // Then `slice` answers an array as well, so the flattening reaches it.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["blue"]]);
  });
});
