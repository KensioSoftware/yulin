import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorLike,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAthenaProjectionOf } from "./sim-athena-projection-parameters.js";

function aTable(
  parameters: Record<string, string>,
  partitionKeys: readonly string[] = ["day"],
): { parameters: Record<string, string>; partitionKeys: { Name: string }[] } {
  return {
    parameters,
    partitionKeys: partitionKeys.map((Name) => ({ Name })),
  };
}

describe("reading partition projection off a Glue table", () => {
  it("reads nothing where projection is off", () => {
    // Given a table with projection parameters and the switch left off.
    const table = aTable({
      "projection.enabled": "false",
      "projection.day.type": "date",
    });

    // When its projection is read.
    const projection = simAthenaProjectionOf(table);

    // Then nothing is projected. The switch is what turns it on.
    assertFalse(projection.enabled);
    assertArrayLength(projection.columns, 0);
  });

  it("reads every parameter one column carries", () => {
    // Given a column with each of its parameters set.
    const table = aTable({
      "projection.enabled": "TRUE",
      "projection.day.type": "DATE",
      "projection.day.format": "yyyy-MM-dd",
      "projection.day.range": "2026-01-01,NOW",
      "projection.day.interval": "7",
      "projection.day.interval.unit": "days",
      "storage.location.template": "s3://logs/x/",
    });

    // When its projection is read.
    const projection = simAthenaProjectionOf(table);

    // Then each one comes back, with the type and the unit folded to the case
    // the rest of this works in.
    assertTrue(projection.enabled);
    assertIdentical(projection.locationTemplate, "s3://logs/x/");
    assertArrayLength(projection.columns, 1);

    const day = projection.columns[0];

    assertIdentical(day.type, "date");
    assertIdentical(day.format, "yyyy-MM-dd");
    assertIdentical(day.interval, 7);
    assertIdentical(day.intervalUnit, "DAYS");
  });

  it("splits an enum's values and drops the spaces around them", () => {
    // Given an enum written with spaces after its commas.
    const table = aTable({
      "projection.enabled": "true",
      "projection.day.type": "enum",
      "projection.day.values": "mon, tue ,wed,",
    });

    // When its projection is read.
    const projection = simAthenaProjectionOf(table);

    // Then the values come back trimmed, and the trailing comma adds none.
    assertArrayLength(projection.columns, 1);
    assertArrayEquals(projection.columns[0].values, ["mon", "tue", "wed"]);
  });

  it("refuses a partition key with no projection type", () => {
    // Given projection on and one of two keys left unconfigured.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.day.type": "enum",
        "projection.day.values": "mon",
      },
      ["day", "region"],
    );

    // When its projection is read.
    // Then it is refused, naming the key that has nothing said about it.
    const error = assertThrowsErrorLike(() => simAthenaProjectionOf(table));
    assertStringIncludes(error.message, "projection.region.type");
  });

  it("refuses a projection type Athena has never had", () => {
    // Given a column declaring a type nobody projects.
    const table = aTable({
      "projection.enabled": "true",
      "projection.day.type": "sequence",
    });

    // When its projection is read.
    // Then it is refused, listing the four that exist.
    const error = assertThrowsErrorLike(() => simAthenaProjectionOf(table));
    assertStringIncludes(error.message, "sequence");
    assertStringIncludes(error.message, "enum, integer, date and injected");
  });

  it("refuses an interval or a digit count that is no whole number", () => {
    // Given a column whose interval is a fraction, and one whose digits are
    // zero.
    const fraction = aTable({
      "projection.enabled": "true",
      "projection.day.type": "integer",
      "projection.day.interval": "1.5",
    });
    const zero = aTable({
      "projection.enabled": "true",
      "projection.day.type": "integer",
      "projection.day.digits": "0",
    });

    // When each is read.
    // Then both are refused, naming the parameter that is wrong.
    assertStringIncludes(
      assertThrowsErrorLike(() => simAthenaProjectionOf(fraction)).message,
      "projection.day.interval",
    );
    assertStringIncludes(
      assertThrowsErrorLike(() => simAthenaProjectionOf(zero)).message,
      "projection.day.digits",
    );
  });
});
