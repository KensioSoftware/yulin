import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  anAggregatedExpression,
  anAnsweredExpression,
} from "./sim-athena-shim.fixture.js";

describe("Trino's least and greatest on SQLite", () => {
  it("answers with the smallest and the largest of two numbers", async () => {
    // Given two numbers written either way round.
    // When each function reads them.
    // Then the ordering is numeric rather than by the text of the number, so
    // ten is above nine.
    assertIdentical(await anAnsweredExpression("least(60, 12)"), 12);
    assertIdentical(await anAnsweredExpression("greatest(60, 12)"), 60);
    assertIdentical(await anAnsweredExpression("least(9, 10)"), 9);
    assertIdentical(await anAnsweredExpression("greatest(1.5, 2)"), 2);
    assertIdentical(await anAnsweredExpression("least(-3, 0)"), -3);
  });

  it("takes more than two arguments", async () => {
    // Given four numbers, with the answer in the middle of them.
    // When each function reads them.
    // Then every argument is weighed rather than the first pair alone.
    assertIdentical(await anAnsweredExpression("least(4, 2, 7, 3)"), 2);
    assertIdentical(await anAnsweredExpression("greatest(4, 2, 7, 3)"), 7);
  });

  it("orders text by its code units", async () => {
    // Given words rather than numbers.
    // When each function reads them.
    // Then they order the way a varchar orders.
    assertIdentical(await anAnsweredExpression("least('b', 'a', 'c')"), "a");
    assertIdentical(await anAnsweredExpression("greatest('b', 'a')"), "b");
  });

  it("answers null where any argument is null", async () => {
    // Given a null beside a value, in each position.
    // When each function reads them.
    // Then null answers, the way Trino has it, rather than the null being
    // passed over for the value beside it.
    assertIdentical(await anAnsweredExpression("least(NULL, 2)"), null);
    assertIdentical(await anAnsweredExpression("least(2, NULL)"), null);
    assertIdentical(await anAnsweredExpression("greatest(1, NULL, 3)"), null);
  });

  it("caps an aggregate", async () => {
    // Given more rows than the cap allows for.
    // When the count is capped, and when it is under the cap.
    // Then the cap is what answers, which is the arithmetic a rule written as
    // a CASE was standing in for.
    assertIdentical(
      await anAggregatedExpression("least(count(*), 2)", [1, 2, 3, 4]),
      2,
    );
    assertIdentical(
      await anAggregatedExpression("least(count(*), 60)", [1, 2]),
      2,
    );
    assertIdentical(
      await anAggregatedExpression("greatest(count(*), 60)", [1, 2]),
      60,
    );
  });

  it("turns the query down over a varbinary", async () => {
    // Given two digests, which are bytes rather than text.
    // When they are ordered.
    // Then the shim raises. Trino orders a varbinary by its bytes and nothing
    // written out here orders the same way, so the query falls back rather
    // than answering from a rendering of them.
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("least(to_utf8('a'), to_utf8('b'))"),
    );
  });
});
