import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  anAnsweredExpression,
  shimStartedAt,
} from "./sim-athena-shim.fixture.js";

describe("Trino's date arithmetic on SQLite", () => {
  it("moves an instant by a unit a clock counts", async () => {
    // Given a timestamp and a date.
    // When each is moved.
    // Then the answer keeps the shape the value was written with, so a date
    // comes back a date.
    assertIdentical(
      await anAnsweredExpression("date_add('day', 3, '2026-08-30T10:00:00Z')"),
      "2026-09-02T10:00:00Z",
    );
    assertIdentical(
      await anAnsweredExpression("date_add('hour', -2, '2026-08-30 10:00:00')"),
      "2026-08-30 08:00:00",
    );
    assertIdentical(
      await anAnsweredExpression("date_add('week', 1, '2026-08-30')"),
      "2026-09-06",
    );
  });

  it("lands on the last day of a month that is too short", async () => {
    // Given the thirty-first of January.
    // When a month is added.
    // Then it lands on the last day of February rather than overflowing into
    // March, which is what Trino does.
    assertIdentical(
      await anAnsweredExpression("date_add('month', 1, '2026-01-31')"),
      "2026-02-28",
    );
    assertIdentical(
      await anAnsweredExpression("date_add('year', -2, '2024-02-29')"),
      "2022-02-28",
    );
  });

  it("counts the whole units between two instants", async () => {
    // Given pairs of instants.
    // When the units between them are counted.
    // Then a part of a unit does not count, whichever way the pair runs.
    assertIdentical(
      await anAnsweredExpression(
        "date_diff('day', '2026-08-01', '2026-08-04T12:00:00Z')",
      ),
      3,
    );
    assertIdentical(
      await anAnsweredExpression(
        "date_diff('day', '2026-08-04T12:00:00Z', '2026-08-01')",
      ),
      -3,
    );
    assertIdentical(
      await anAnsweredExpression(
        "date_diff('quarter', '2026-01-01', '2026-07-01')",
      ),
      2,
    );
  });

  it("counts a calendar month by whether moving reached it", async () => {
    // Given a span ending on a month too short to hold the day it started on.
    // When the months between them are counted.
    // Then it counts as a whole month, because adding one to the start lands
    // exactly on the end. That is how `java.time` counts and so how Trino
    // does.
    assertIdentical(
      await anAnsweredExpression(
        "date_diff('month', '2026-01-31', '2026-02-28')",
      ),
      1,
    );
    assertIdentical(
      await anAnsweredExpression(
        "date_diff('month', '2026-01-15', '2026-02-10')",
      ),
      0,
    );
    assertIdentical(
      await anAnsweredExpression(
        "date_diff('month', '2026-03-15', '2026-01-10')",
      ),
      -2,
    );
    assertIdentical(
      await anAnsweredExpression(
        "date_diff('month', '2026-03-10', '2026-01-15')",
      ),
      -1,
    );
  });

  it("reads a wall clock in another zone", async () => {
    // Given an instant in UTC.
    // When it is read in Tokyo.
    // Then the wall clock moves and the `Z` comes off, since the answer is no
    // longer in UTC and saying it was would be worse than saying nothing.
    assertIdentical(
      await anAnsweredExpression(
        "at_timezone('2026-08-26T12:00:00Z', 'Asia/Tokyo')",
      ),
      "2026-08-26T21:00:00",
    );
    assertIdentical(
      await anAnsweredExpression("at_timezone(NULL, 'Asia/Tokyo')"),
      null,
    );
  });

  it("keeps the milliseconds a zone shift never moved", async () => {
    // Given an instant written to the millisecond.
    // When it is read in another zone.
    // Then the milliseconds survive. The wall clock comes back to the second,
    // and a zone shift moves whole minutes rather than fractions.
    assertIdentical(
      await anAnsweredExpression(
        "at_timezone('2026-08-26T12:00:00.500Z', 'Asia/Tokyo')",
      ),
      "2026-08-26T21:00:00.500",
    );
  });

  it("refuses a timestamp written finer than the millisecond", async () => {
    // Given a value written to four fractional digits.
    // When it is moved.
    // Then the statement raises. An instant has no room for the fourth digit,
    // and rendering the answer back would write a `Z` where that digit was.
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("date_add('day', 0, '2026-08-02T12:00:00.1234')"),
    );
    assertIdentical(
      await anAnsweredExpression(
        "date_add('day', 0, '2026-08-02T12:00:00.123')",
      ),
      "2026-08-02T12:00:00.123",
    );
  });

  it("reads the clock the simulation is running on", async () => {
    // Given a simulation whose query started at a known instant.
    // When a statement asks for the date and the time.
    // Then both answer from that instant rather than from the host, so a test
    // that froze time gets the instant it froze.
    assertIdentical(await anAnsweredExpression("current_date"), "2026-08-26");
    assertIdentical(
      await anAnsweredExpression("current_timestamp"),
      "2026-08-26 17:31:00.000",
    );
    assertIdentical(
      shimStartedAt.toISOString(),
      "2026-08-26T17:31:00.000Z",
      "the fixture instant is what those two answers come from",
    );
  });

  it("answers null where there is nothing to move", async () => {
    // Given a null timestamp and a null distance.
    // When each is moved or measured.
    // Then the answer is null, the way every Trino scalar answers a null.
    assertIdentical(
      await anAnsweredExpression("date_add('day', 1, NULL)"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("date_add('day', NULL, '2026-08-30')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("date_diff('day', NULL, '2026-08-30')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("date_diff('day', '2026-08-30', NULL)"),
      null,
    );
  });

  it("turns the query down rather than guessing", async () => {
    // Given a unit Trino does not name and text that is no timestamp.
    // When each is used.
    // Then the statement raises, which leaves the declared result to answer.
    // A null would be a wrong answer wearing the shape of a right one.
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("date_add('fortnight', 1, '2026-08-30')"),
    );
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("date_add('day', 1, 'the other week')"),
    );
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression(
        "at_timezone('2026-08-26T12:00:00Z', 'Mars/Olympus')",
      ),
    );
  });
});
