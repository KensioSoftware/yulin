import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredExpression } from "./sim-athena-shim.fixture.js";

const noon = "2026-08-02T12:34:56Z";

describe("Trino's date functions on SQLite", () => {
  it("truncates a timestamp to each unit it knows", async () => {
    // Given one timestamp.
    // When it is truncated to a year, a month, an hour and a minute.
    // Then the fields below the unit read zero and the ones above it stand.
    assertIdentical(
      await anAnsweredExpression(`date_trunc('year', '${noon}')`),
      "2026-01-01T00:00:00Z",
    );
    assertIdentical(
      await anAnsweredExpression(`date_trunc('MONTH', '${noon}')`),
      "2026-08-01T00:00:00Z",
    );
    assertIdentical(
      await anAnsweredExpression(`date_trunc('hour', '${noon}')`),
      "2026-08-02T12:00:00Z",
    );
    assertIdentical(
      await anAnsweredExpression(`date_trunc('minute', '${noon}')`),
      "2026-08-02T12:34:00Z",
    );
  });

  it("keeps a date a date", async () => {
    // Given a value written to the day.
    // When it is truncated to a day and to a month.
    // Then it stays written to the day, since there is nothing below to zero.
    assertIdentical(
      await anAnsweredExpression("date_trunc('day', '2026-08-02')"),
      "2026-08-02",
    );
    assertIdentical(
      await anAnsweredExpression("date_trunc('month', '2026-08-02')"),
      "2026-08-01",
    );
  });

  it("leaves a timestamp alone for a unit it has no answer for", async () => {
    // Given a unit outside the ones Trino names.
    // When a timestamp is truncated to it.
    // Then the timestamp comes back whole rather than as a fragment.
    assertIdentical(
      await anAnsweredExpression(`date_trunc('quarter', '${noon}')`),
      noon,
    );
  });

  it("answers null where there is no timestamp to truncate", async () => {
    // Given a null.
    // When it is truncated.
    // Then the answer is null, the way every Trino scalar answers a null.
    assertIdentical(
      await anAnsweredExpression("date_trunc('day', NULL)"),
      null,
    );
  });

  it("formats a timestamp by the fields MySQL and Trino share", async () => {
    // Given one timestamp.
    // When it is written out through a format string.
    // Then each field reads off the ISO-8601 text, and `%%` is a literal.
    assertIdentical(
      await anAnsweredExpression(`date_format('${noon}', '%d/%m/%Y %H:%i:%S')`),
      "02/08/2026 12:34:56",
    );
    assertIdentical(
      await anAnsweredExpression(`date_format('${noon}', '%Y%% %q')`),
      "2026% %q",
    );
    assertIdentical(
      await anAnsweredExpression("date_format(NULL, '%Y')"),
      null,
    );
  });

  it("reads and writes ISO-8601 text", async () => {
    // Given a timestamp and a date written as ISO-8601.
    // When each conversion runs.
    // Then the text is what a table holds, so each is close to a no-op.
    assertIdentical(
      await anAnsweredExpression(`from_iso8601_timestamp('${noon}')`),
      noon,
    );
    assertIdentical(
      await anAnsweredExpression(`from_iso8601_date('${noon}')`),
      "2026-08-02",
    );
    assertIdentical(await anAnsweredExpression(`to_iso8601('${noon}')`), noon);
    assertIdentical(await anAnsweredExpression("to_iso8601(NULL)"), null);
    assertIdentical(
      await anAnsweredExpression("from_iso8601_timestamp(NULL)"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("from_iso8601_date(NULL)"),
      null,
    );
  });

  it("converts between an instant and a Unix time", async () => {
    // Given a Unix time and a timestamp.
    // When each is converted to the other.
    // Then they agree, and text that is no timestamp answers null.
    assertIdentical(
      await anAnsweredExpression("from_unixtime(1785674400)"),
      "2026-08-02 12:40:00.000",
    );
    assertIdentical(
      await anAnsweredExpression("to_unixtime('2026-08-02T12:40:00Z')"),
      1_785_674_400,
    );
    assertIdentical(await anAnsweredExpression("from_unixtime(NULL)"), null);
    assertIdentical(await anAnsweredExpression("to_unixtime('never')"), null);
  });
});
