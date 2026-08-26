import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  anAggregatedExpression,
  anAnsweredExpression,
} from "./sim-athena-shim.fixture.js";

const document = '\'{"tenant":{"name":"acme"},"tags":["a","b"],"n":4}\'';

describe("Trino's functions over a whole JSON document", () => {
  it("answers with JSON rather than with the value inside it", async () => {
    // Given a document holding a string and an object.
    // When each is extracted.
    // Then a string comes back quoted, the way Trino answers with JSON.
    // SQLite's own `json_extract` unwraps it, and a statement comparing the
    // answer against a bare string matches on one and not the other.
    assertIdentical(
      await anAnsweredExpression(`json_extract(${document}, '$.tenant.name')`),
      '"acme"',
    );
    assertIdentical(
      await anAnsweredExpression(`json_extract(${document}, '$.tenant')`),
      '{"name":"acme"}',
    );
    assertIdentical(
      await anAnsweredExpression(`json_extract(${document}, '$.absent')`),
      null,
    );
  });

  it("reads text as a document and counts what it holds", async () => {
    // Given text that is JSON and text that is not.
    // When each is read.
    // Then the text that is no JSON answers null, which is the forgiving
    // direction the rest of the engine takes. Trino fails the query.
    assertIdentical(
      await anAnsweredExpression(`json_parse('{"b":2,"a":1}')`),
      '{"b":2,"a":1}',
    );
    assertIdentical(await anAnsweredExpression("json_parse('nope')"), null);
    assertIdentical(await anAnsweredExpression("json_parse(NULL)"), null);
  });

  it("counts the entries at a path", async () => {
    // Given an array, an object and a scalar.
    // When each is sized.
    // Then a scalar holds no entries at all, which Trino counts as zero.
    assertIdentical(
      await anAnsweredExpression(`json_size(${document}, '$.tags')`),
      2,
    );
    assertIdentical(
      await anAnsweredExpression(`json_size(${document}, '$.tenant')`),
      1,
    );
    assertIdentical(
      await anAnsweredExpression(`json_size(${document}, '$.n')`),
      0,
    );
    assertIdentical(
      await anAnsweredExpression(`json_size(${document}, '$.absent')`),
      null,
    );
  });
});

describe("Trino's array functions on SQLite", () => {
  it("says whether an array holds an element", async () => {
    // Given an array of text and one of numbers.
    // When each is asked about an element.
    // Then it answers on the value rather than on its text, so a number is
    // found as a number.
    assertIdentical(
      await anAnsweredExpression(`contains('["a","b"]', 'b')`),
      1,
    );
    assertIdentical(
      await anAnsweredExpression(`contains('["a","b"]', 'z')`),
      0,
    );
    assertIdentical(await anAnsweredExpression("contains('[1,2]', 2)"), 1);
    assertIdentical(await anAnsweredExpression("contains('4', 4)"), null);
    assertIdentical(await anAnsweredExpression("contains(NULL, 'a')"), null);
  });

  it("writes an array out as text", async () => {
    // Given an array carrying a null.
    // When it is joined with and without something to write in the null's
    // place.
    // Then the null is left out unless the call says what to put there.
    assertIdentical(
      await anAnsweredExpression(`array_join('["a",null,"b"]', '-')`),
      "a-b",
    );
    assertIdentical(
      await anAnsweredExpression(`array_join('["a",null,"b"]', '-', 'X')`),
      "a-X-b",
    );
    assertIdentical(
      await anAnsweredExpression(`array_join('["a"]', NULL)`),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("array_join('[1,true,2]', '-')"),
      "1-true-2",
    );
    assertIdentical(await anAnsweredExpression("array_join('4', '-')"), null);
  });

  it("takes a run out of an array, counted from one", async () => {
    // Given an array of four.
    // When runs are taken from the front and from the end.
    // Then Trino's one-based start is what answers, and a run reaching past
    // the end stops there.
    assertIdentical(
      await anAnsweredExpression("slice('[1,2,3,4]', 2, 2)"),
      "[2,3]",
    );
    assertIdentical(
      await anAnsweredExpression("slice('[1,2,3,4]', -2, 2)"),
      "[3,4]",
    );
    assertIdentical(
      await anAnsweredExpression("slice('[1,2,3]', 2, 9)"),
      "[2,3]",
    );
    assertIdentical(
      await anAnsweredExpression("slice('[1,2]', NULL, 1)"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("slice('[1,2]', 1, NULL)"),
      null,
    );
  });

  it("collects a column into an array", async () => {
    // Given two rows.
    // When they are collected.
    // Then the answer is the JSON text an array column is held as, so it can
    // be flattened again or counted.
    assertIdentical(
      await anAggregatedExpression("array_agg(value)", [1, 2]),
      "[1,2]",
    );
    assertIdentical(
      await anAggregatedExpression("cardinality(array_agg(value))", ["a", "b"]),
      2,
    );
  });

  it("turns the query down rather than guessing", async () => {
    // Given a run starting at zero and an array of objects.
    // When each is used.
    // Then the statement raises, which leaves the declared result to answer.
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("slice('[1,2,3]', 0, 1)"),
    );
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("slice('[1,2,3]', 1, -1)"),
    );
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression(`array_join('[{"a":1}]', '-')`),
    );
  });
});
