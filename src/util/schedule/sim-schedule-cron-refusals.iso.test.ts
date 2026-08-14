import { describe, expect, it } from "vitest";

import { awsCronFieldSpecs } from "./cron/sim-cron-field-spec.js";
import { SimSchedule } from "./sim-schedule.js";
import type { SimScheduleDialect } from "./sim-schedule-dialect.js";
import { SimUnsimulatedScheduleExpressionError } from "./sim-schedule.error.js";

/**
 * A dialect insisting a rate's unit agrees with its value, as EventBridge does.
 */
const strict: SimScheduleDialect = {
  cronFields: awsCronFieldSpecs,
  requiresRateAgreement: true,
};

const noon = new Date("2026-07-26T12:00:00.000Z");

/**
 * The next instant a schedule falls due after one, as an ISO string.
 */
function nextAfter(source: string, from = noon): string | undefined {
  return SimSchedule.of(source, strict).nextAfter(from)?.toISOString();
}

describe("SimSchedule cron refusals", () => {
  it("refuses an expression without the six fields", () => {
    // Given the same expression missing its year
    // When it is read
    // Then it is refused naming the six fields EventBridge expects
    expect(() => nextAfter("cron(0 12 * * ?)")).toThrow(
      /6 fields separated by spaces, minutes hours day-of-month month day-of-week year/u,
    );
  });

  it("refuses a dialect that does not describe six fields", () => {
    // Given a dialect a field short, and an expression matching it
    // When it is read
    // Then it is refused, since the positions are what give a field meaning
    expect(() =>
      SimSchedule.of("cron(0 12 * * ?)", {
        cronFields: awsCronFieldSpecs.slice(0, 5),
        requiresRateAgreement: true,
      }).nextAfter(noon),
    ).toThrow(/a cron dialect describes six fields/u);
  });

  it("refuses both day fields saying something", () => {
    expect(() => nextAfter("cron(0 12 1 * MON *)")).toThrow(
      /cannot both be given/u,
    );
  });

  it("refuses a wildcard in a field that does not take it", () => {
    expect(() => nextAfter("cron(? 12 * * ? *)")).toThrow(
      /minutes field does not take '\?'/u,
    );
    expect(() => nextAfter("cron(0 12 ? * MON/2 *)")).toThrow(
      /day-of-week field does not take '\/'/u,
    );
  });

  it("refuses a value outside its field", () => {
    expect(() => nextAfter("cron(60 12 * * ? *)")).toThrow(
      /minutes field takes 0 to 59/u,
    );
  });

  it("refuses a part it cannot read at all", () => {
    expect(() => nextAfter("cron(0 12 * SOM ? *)")).toThrow(
      /month field cannot be read: 'SOM'/u,
    );
    expect(() => nextAfter("cron(0/2/3 12 * * ? *)")).toThrow(
      /more than one '\/'/u,
    );
    expect(() => nextAfter("cron(0/x 12 * * ? *)")).toThrow(
      /step is a whole number/u,
    );
  });

  it("refuses the wildcards it reads no meaning from", () => {
    // Given the last-day, nearest-weekday and nth-weekday wildcards
    // When each is read
    // Then each is refused as unsimulated rather than as a mistake, since real
    // EventBridge does take them
    for (const source of [
      "cron(0 12 L * ? *)",
      "cron(0 12 3W * ? *)",
      "cron(0 12 ? * 3#2 *)",
    ]) {
      expect(() => nextAfter(source)).toThrow(
        SimUnsimulatedScheduleExpressionError,
      );
    }
  });
});
