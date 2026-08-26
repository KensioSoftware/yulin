import {
  assertArrayEquals,
  assertUndefined,
  assertStringIncludes,
  assertThrowsErrorLike,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAthenaProjectionColumn } from "./sim-athena-projection-column.js";
import { simAthenaProjectedValues } from "./sim-athena-projection-values.js";

const noon = new Date("2026-08-26T12:00:00.000Z");

function aColumn(
  column: Partial<SimAthenaProjectionColumn> &
    Pick<SimAthenaProjectionColumn, "type">,
): SimAthenaProjectionColumn {
  return {
    name: "day",
    values: undefined,
    range: undefined,
    format: undefined,
    interval: undefined,
    intervalUnit: undefined,
    digits: undefined,
    ...column,
  };
}

describe("the values a projected partition column takes", () => {
  it("takes an enum column's values as they were listed", () => {
    // Given a column projected as an enum.
    const column = aColumn({
      type: "enum",
      values: ["eu-west-2", "us-east-1"],
    });

    // When its values are read.
    const values = simAthenaProjectedValues(column, noon);

    // Then they come back in the order the table listed them.
    assertArrayEquals(values, ["eu-west-2", "us-east-1"]);
  });

  it("counts an integer column through its range, padding to its digits", () => {
    // Given a column projected as an integer over three values, zero padded.
    const column = aColumn({ type: "integer", range: "1,3", digits: 2 });

    // When its values are read.
    const values = simAthenaProjectedValues(column, noon);

    // Then each is padded to the declared width.
    assertArrayEquals(values, ["01", "02", "03"]);
  });

  it("steps an integer column by its interval", () => {
    // Given a column projected every five.
    const column = aColumn({ type: "integer", range: "0,10", interval: 5 });

    // When its values are read.
    const values = simAthenaProjectedValues(column, noon);

    // Then only the values on the step come back.
    assertArrayEquals(values, ["0", "5", "10"]);
  });

  it("walks a date column a day at a time, taking the unit from its format", () => {
    // Given a column projected across three days, with no interval unit set.
    const column = aColumn({
      type: "date",
      range: "2026-08-24,2026-08-26",
      format: "yyyy-MM-dd",
    });

    // When its values are read.
    const values = simAthenaProjectedValues(column, noon);

    // Then the format's finest field is what one step moves.
    assertArrayEquals(values, ["2026-08-24", "2026-08-25", "2026-08-26"]);
  });

  it("reads NOW and an offset against the clock it was given", () => {
    // Given a column running from two days ago to now.
    const column = aColumn({
      type: "date",
      range: "NOW-2DAYS,NOW",
      format: "yyyy-MM-dd",
    });

    // When its values are read at a fixed instant.
    const values = simAthenaProjectedValues(column, noon);

    // Then the range ends on that day. A frozen clock projects the same
    // partitions every run.
    assertArrayEquals(values, ["2026-08-24", "2026-08-25", "2026-08-26"]);
  });

  it("walks a month at a time where the format stops at months", () => {
    // Given a column formatted to the month.
    const column = aColumn({
      type: "date",
      range: "2026-06,2026-08",
      format: "yyyy-MM",
    });

    // When its values are read.
    const values = simAthenaProjectedValues(column, noon);

    // Then one step is one month.
    assertArrayEquals(values, ["2026-06", "2026-07", "2026-08"]);
  });

  it("answers with nothing for an injected column", () => {
    // Given a column whose values the query supplies.
    // When its values are read.
    const values = simAthenaProjectedValues(
      aColumn({ type: "injected" }),
      noon,
    );

    // Then there are none to read. The query has to say.
    assertUndefined(values);
  });

  it("refuses an integer range carrying NOW", () => {
    // Given an integer column whose range was written for a date.
    const column = aColumn({ type: "integer", range: "0,NOW" });

    // When its values are read.
    // Then it is refused, naming the column and what is wrong.
    const error = assertThrowsErrorLike(() =>
      simAthenaProjectedValues(column, noon),
    );
    assertStringIncludes(error.message, "INVALID_TABLE_PROPERTY");
    assertStringIncludes(error.message, "Partition column day");
    assertStringIncludes(error.message, "NOW");
  });

  it("refuses a date column with no format", () => {
    // Given a date column that never said how its values are written.
    const column = aColumn({ type: "date", range: "2026-01-01,NOW" });

    // When its values are read.
    // Then it is refused, naming the parameter that is missing.
    const error = assertThrowsErrorLike(() =>
      simAthenaProjectedValues(column, noon),
    );
    assertStringIncludes(error.message, "projection.day.format");
  });

  it("refuses a range whose bounds are empty", () => {
    // Given a range that is a comma and nothing else.
    const column = aColumn({ type: "integer", range: "," });

    // When its values are read.
    // Then it is refused. Reading both bounds as zero projects one partition
    // called 0 out of a configuration that says nothing.
    const error = assertThrowsErrorLike(() =>
      simAthenaProjectedValues(column, noon),
    );
    assertStringIncludes(error.message, "projection.day.range");
  });

  it("refuses an interval unit Athena does not count", () => {
    // Given a date column counting its interval in fortnights.
    const column = aColumn({
      type: "date",
      range: "2026-08-01,2026-08-26",
      format: "yyyy-MM-dd",
      intervalUnit: "FORTNIGHTS",
    });

    // When its values are read.
    // Then it is refused. Falling back to the format's own unit would answer
    // with a step nobody asked for.
    const error = assertThrowsErrorLike(() =>
      simAthenaProjectedValues(column, noon),
    );
    assertStringIncludes(error.message, "FORTNIGHTS");
  });

  it("refuses a bound with whitespace inside NOW", () => {
    // Given a bound that reads as NOW only once its spaces are taken out.
    const column = aColumn({
      type: "date",
      range: "2026-08-01,N OW",
      format: "yyyy-MM-dd",
    });

    // When its values are read.
    // Then it is refused, as the malformed bound it is.
    const error = assertThrowsErrorLike(() =>
      simAthenaProjectedValues(column, noon),
    );
    assertStringIncludes(error.message, "N OW");
  });

  it("steps a date column by weeks where its unit says so", () => {
    // Given a column stepping a fortnight at a time.
    const column = aColumn({
      type: "date",
      range: "2026-08-01,2026-08-26",
      format: "yyyy-MM-dd",
      interval: 2,
      intervalUnit: "WEEKS",
    });

    // When its values are read.
    const values = simAthenaProjectedValues(column, noon);

    // Then each is fourteen days on from the last.
    assertArrayEquals(values, ["2026-08-01", "2026-08-15"]);
  });

  it("refuses a range that is not two bounds", () => {
    // Given a column whose range never got its second bound.
    const column = aColumn({ type: "integer", range: "1" });

    // When its values are read.
    // Then it is refused.
    const error = assertThrowsErrorLike(() =>
      simAthenaProjectedValues(column, noon),
    );
    assertStringIncludes(error.message, "projection.day.range");
  });
});
