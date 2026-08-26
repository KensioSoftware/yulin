import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  anAggregatedExpression,
  anAnsweredExpression,
} from "./sim-athena-shim.fixture.js";

const document = '\'{"tenant":{"name":"acme","live":true},"tags":["a","b"]}\'';

describe("Trino's JSON and array functions on SQLite", () => {
  it("reads a scalar out of a JSON document by its path", async () => {
    // Given a document with a nested object in it.
    // When a path reaches a scalar, and when one reaches the object itself.
    // Then the scalar comes back and the object answers null, as Trino has it.
    assertIdentical(
      await anAnsweredExpression(
        `json_extract_scalar(${document}, '$.tenant.name')`,
      ),
      "acme",
    );
    assertIdentical(
      await anAnsweredExpression(
        `json_extract_scalar(${document}, '$.tenant.live')`,
      ),
      "true",
    );
    assertIdentical(
      await anAnsweredExpression(
        `json_extract_scalar(${document}, '$.tenant')`,
      ),
      null,
    );
    assertIdentical(
      await anAnsweredExpression(
        `json_extract_scalar(${document}, '$.absent')`,
      ),
      null,
    );
  });

  it("answers null where there is nothing to read", async () => {
    // Given a null document, text that is not JSON, and no path.
    // When each is read.
    // Then none of them fails the query.
    assertIdentical(
      await anAnsweredExpression("json_extract_scalar(NULL, '$.a')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("json_extract_scalar('not json', '$.a')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression(`json_extract_scalar(${document}, NULL)`),
      null,
    );
  });

  it("counts an array and reads an element of one", async () => {
    // Given an array column held as JSON text.
    // When it is counted and indexed.
    // Then Trino's one-based indexing is what answers.
    assertIdentical(
      await anAnsweredExpression(`cardinality(json_extract(${document}, '$'))`),
      null,
    );
    assertIdentical(await anAnsweredExpression(`cardinality('["a","b"]')`), 2);
    assertIdentical(await anAnsweredExpression("cardinality('4')"), null);
    assertIdentical(
      await anAnsweredExpression(`element_at('["a","b"]', 2)`),
      "b",
    );
    assertIdentical(
      await anAnsweredExpression(`element_at('["a","b"]', 9)`),
      null,
    );
    assertIdentical(
      await anAnsweredExpression(`element_at('["a"]', NULL)`),
      null,
    );
  });

  it("reads a map by its key", async () => {
    // Given a map column held as JSON text.
    // When it is read by a key it has and by one it has not.
    // Then the value comes back, and the absent key answers null.
    assertIdentical(
      await anAnsweredExpression(`element_at('{"a":1}', 'a')`),
      1,
    );
    assertIdentical(
      await anAnsweredExpression(`element_at('{"a":1}', 'b')`),
      null,
    );
    assertIdentical(await anAnsweredExpression("element_at('4', 'a')"), null);
  });
});

describe("Trino's string functions on SQLite", () => {
  it("matches a regular expression", async () => {
    // Given a value and three patterns.
    // When each is matched.
    // Then a pattern SQLite's own regular expressions cannot take answers
    // null rather than failing the query.
    assertIdentical(await anAnsweredExpression("regexp_like('abc', 'b+')"), 1);
    assertIdentical(await anAnsweredExpression("regexp_like('abc', '^z')"), 0);
    assertIdentical(
      await anAnsweredExpression("regexp_like('abc', '(')"),
      null,
    );
    assertIdentical(await anAnsweredExpression("regexp_like(NULL, 'b')"), null);
  });

  it("splits a value and finds a substring in one", async () => {
    // Given a path and a word inside it.
    // When each function reads it.
    // Then both count from one, and both answer nothing off the end.
    assertIdentical(
      await anAnsweredExpression("split_part('a/b/c', '/', 2)"),
      "b",
    );
    assertIdentical(
      await anAnsweredExpression("split_part('a/b', '/', 9)"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("split_part(NULL, '/', 1)"),
      null,
    );
    assertIdentical(await anAnsweredExpression("strpos('abc', 'c')"), 3);
    assertIdentical(await anAnsweredExpression("strpos('abc', 'z')"), 0);
    assertIdentical(await anAnsweredExpression("strpos('abc', NULL)"), null);
  });
});

describe("Trino's approximate aggregates on SQLite", () => {
  it("counts distinct values exactly", async () => {
    // Given four values, one of them repeated and one of them null.
    // When they are counted.
    // Then the count is exact rather than approximate, which is the
    // simulation being more accurate than AWS.
    assertIdentical(
      await anAggregatedExpression("approx_distinct(value)", [
        "a",
        "b",
        "a",
        null,
      ]),
      2,
    );
    assertIdentical(
      await anAggregatedExpression("approx_distinct(value)", [1, 2]),
      2,
    );
  });

  it("takes a percentile at the nearest rank", async () => {
    // Given four numbers.
    // When a percentile is taken, and when the percentile itself is null.
    // Then the value at that rank answers, a null percentile falls back to
    // the median, and a column of nulls answers null.
    assertIdentical(
      await anAggregatedExpression(
        "approx_percentile(value, 0.5)",
        [1, 2, 3, 4],
      ),
      3,
    );
    assertIdentical(
      await anAggregatedExpression("approx_percentile(value, 1)", [1, 2, 3, 4]),
      4,
    );
    assertIdentical(
      await anAggregatedExpression("approx_percentile(value, NULL)", [10, 20]),
      20,
    );
    assertIdentical(
      await anAggregatedExpression("approx_percentile(value, 0.5)", [null]),
      null,
    );
  });
});
