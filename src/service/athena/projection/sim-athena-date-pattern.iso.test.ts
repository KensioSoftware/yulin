import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAthenaAddUnits } from "./sim-athena-date-arithmetic.js";
import { simAthenaFormatDate } from "./sim-athena-date-format.js";
import { simAthenaParseDate } from "./sim-athena-date-parse.js";
import {
  simAthenaDateUnit,
  simAthenaPatternUnit,
} from "./sim-athena-date-pattern.js";

const instant = new Date("2026-08-26T09:07:05.000Z");

describe("reading and writing a projected date", () => {
  it("writes every field a partition path uses", () => {
    // Given an instant and a pattern naming all six fields.
    // When it is written out.
    const text = simAthenaFormatDate(instant, "yyyy/MM/dd/HH-mm-ss");

    // Then each field is padded to the width the pattern asked for.
    assertIdentical(text, "2026/08/26/09-07-05");
  });

  it("takes text in single quotes as literal", () => {
    // Given a pattern quoting a separator whose letters would otherwise read
    // as date fields.
    // When an instant is written out.
    // Then the quoted text comes through as itself, quotes stripped, the way
    // Java reads one.
    assertIdentical(simAthenaFormatDate(instant, "'day='yyyy"), "day=2026");
    assertIdentical(simAthenaFormatDate(instant, "yyyy''MM"), "2026'08");
  });

  it("takes the finest field of a pattern as its step", () => {
    // Given patterns of different granularity.
    // When each one's unit is read.
    // Then the finest field it carries is what one step moves.
    assertIdentical(simAthenaPatternUnit("yyyy"), "YEARS");
    assertIdentical(simAthenaPatternUnit("yyyy-MM"), "MONTHS");
    assertIdentical(simAthenaPatternUnit("yyyy-MM-dd"), "DAYS");
    assertIdentical(simAthenaPatternUnit("yyyy-MM-dd-HH"), "HOURS");
    assertIdentical(simAthenaPatternUnit("yyyy-MM-dd HH:mm"), "MINUTES");
    assertIdentical(simAthenaPatternUnit("yyyyMMddHHmmss"), "SECONDS");
    assertUndefined(simAthenaPatternUnit("'logs'"));
  });

  it("reads a unit named in the singular or the plural", () => {
    // Given the two ways a table writes one.
    // When each is read.
    // Then both come to the same unit.
    assertIdentical(simAthenaDateUnit("DAY"), "DAYS");
    assertIdentical(simAthenaDateUnit("days"), "DAYS");
    assertUndefined(simAthenaDateUnit("FORTNIGHTS"));
    assertUndefined(simAthenaDateUnit(undefined));
  });

  it("moves an instant on by each unit it counts", () => {
    // Given one instant.
    // When it is moved by one of each unit.
    // Then each lands where that unit takes it.
    const moved = (unit: Parameters<typeof simAthenaAddUnits>[2]): string =>
      simAthenaAddUnits(instant, 1, unit).toISOString();

    assertIdentical(moved("YEARS"), "2027-08-26T09:07:05.000Z");
    assertIdentical(moved("MONTHS"), "2026-09-26T09:07:05.000Z");
    assertIdentical(moved("DAYS"), "2026-08-27T09:07:05.000Z");
    assertIdentical(moved("HOURS"), "2026-08-26T10:07:05.000Z");
    assertIdentical(moved("MINUTES"), "2026-08-26T09:08:05.000Z");
    assertIdentical(moved("SECONDS"), "2026-08-26T09:07:06.000Z");
  });

  it("clamps a month end and a leap day rather than overflowing", () => {
    // Given the last day of a long month and a leap day.
    // When each is moved by a month and by a year.
    const endOfJanuary = simAthenaAddUnits(
      new Date("2024-01-31T00:00:00.000Z"),
      1,
      "MONTHS",
    );
    const leapDay = simAthenaAddUnits(
      new Date("2024-02-29T00:00:00.000Z"),
      1,
      "YEARS",
    );

    // Then each lands on the last day of the month it reaches. The native
    // setter rolls both into the month after, and Athena moves dates through
    // Java, which clamps.
    assertIdentical(endOfJanuary.toISOString(), "2024-02-29T00:00:00.000Z");
    assertIdentical(leapDay.toISOString(), "2025-02-28T00:00:00.000Z");
  });

  it("counts a week as seven days", () => {
    // Given a table stepping its projection weekly.
    // When an instant is moved by two weeks.
    // Then it lands fourteen days on. No pattern letter writes a week, so a
    // table asks for one through its interval unit.
    assertIdentical(simAthenaDateUnit("WEEKS"), "WEEKS");
    assertIdentical(
      simAthenaAddUnits(instant, 2, "WEEKS").toISOString(),
      "2026-09-09T09:07:05.000Z",
    );
  });

  it("reads a field written once as however many digits are there", () => {
    // Given a pattern whose month and day are written once each, which is how
    // Java says to take as many digits as the value needs.
    // When a date with a two digit month is read back.
    const parsed = simAthenaParseDate("2026-10-5", "yyyy-M-d");

    // Then both fields read. A reader taking one digit stops mid-month.
    assertIdentical(parsed?.toISOString(), "2026-10-05T00:00:00.000Z");
    assertIdentical(simAthenaFormatDate(instant, "yyyy-M-d"), "2026-8-26");
  });

  it("reads a two digit year as this century", () => {
    // Given a year written with two digits.
    // When it is read.
    const parsed = simAthenaParseDate("26-01", "yy-MM");

    // Then it lands in the 2000s. Handing 26 straight to the calendar gives
    // 1926, and the round trip hides it because the year writes back as 26.
    assertIdentical(parsed?.toISOString(), "2026-01-01T00:00:00.000Z");
  });

  it("reads a date back out of the text a pattern wrote", () => {
    // Given text written in a pattern.
    // When it is read back.
    const parsed = simAthenaParseDate("2026-08-26", "yyyy-MM-dd");

    // Then it comes back as the first instant of that day, since the pattern
    // says nothing about the time.
    assertIdentical(parsed?.toISOString(), "2026-08-26T00:00:00.000Z");
  });

  it("refuses text that does not fit its pattern", () => {
    // Given text that is the wrong shape, the wrong length, or names a month
    // and a day that do not exist.
    // When each is read against a pattern.
    // Then none of them reads. A thirteenth month rolls into next January
    // otherwise, and a wrong date is worse than a refused one.
    assertUndefined(simAthenaParseDate("2026/08/26", "yyyy-MM-dd"));
    assertUndefined(simAthenaParseDate("2026-8-26", "yyyy-MM-dd"));
    assertUndefined(simAthenaParseDate("2026-08-26-01", "yyyy-MM-dd"));
    assertUndefined(simAthenaParseDate("2026-13-01", "yyyy-MM-dd"));
    assertUndefined(simAthenaParseDate("2026-02-30", "yyyy-MM-dd"));
    assertUndefined(simAthenaParseDate("20xx-08-26", "yyyy-MM-dd"));
  });
});
