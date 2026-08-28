import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAthenaCountDistinct } from "./sim-athena-count-distinct.js";

describe("rewriting a count over a distinct expression", () => {
  it("rewrites an expression and leaves a plain column alone", () => {
    // Given a count over an expression and a count over a column.
    // When each is rewritten.
    // Then the expression becomes a call the parser's Athena grammar takes,
    // and the column is left for SQLite to count natively.
    assertIdentical(
      simAthenaCountDistinct("SELECT count(DISTINCT concat(a, b)) FROM t"),
      "SELECT count_distinct(concat(a, b)) FROM t",
    );
    assertIdentical(
      simAthenaCountDistinct("SELECT COUNT( DISTINCT  t.c ) FROM t"),
      "SELECT COUNT( DISTINCT  t.c ) FROM t",
    );
    assertIdentical(
      simAthenaCountDistinct(
        "SELECT count(DISTINCT lower(a)), count(DISTINCT upper(b)) FROM t",
      ),
      "SELECT count_distinct(lower(a)), count_distinct(upper(b)) FROM t",
    );
  });

  it("leaves a call written inside quotes alone", () => {
    // Given the text of a call sitting inside a string literal, inside a
    // delimited identifier, and inside a literal carrying a doubled quote.
    // When each is rewritten.
    // Then nothing changes. Rewriting inside a literal would change the value
    // a comparison is made against, and rewriting inside an identifier would
    // name a different column.
    for (const sql of [
      `SELECT a FROM t WHERE b = 'count(DISTINCT f(x))'`,
      `SELECT "count(DISTINCT f(x))" FROM t`,
      `SELECT a FROM t WHERE b = 'it''s count(DISTINCT f(x))'`,
    ]) {
      assertIdentical(simAthenaCountDistinct(sql), sql, sql);
    }
  });

  it("passes over a parenthesis that quotes carry", () => {
    // Given a call whose argument names a column with a parenthesis in it.
    // When it is rewritten.
    // Then the call is read to its own closing parenthesis. Counting the one
    // inside the identifier would cut the argument short and write a
    // statement nobody could run.
    assertIdentical(
      simAthenaCountDistinct(`SELECT count(DISTINCT lower("a)b")) FROM t`),
      `SELECT count_distinct(lower("a)b")) FROM t`,
    );
  });

  it("leaves a call the statement never closes alone", () => {
    // Given a statement with a parenthesis left open.
    // When it is rewritten.
    // Then nothing changes, and the parser refuses the statement as written.
    const sql = "SELECT count(DISTINCT lower(x) FROM t";

    assertIdentical(simAthenaCountDistinct(sql), sql);
  });
});
