import { describe, expect, it } from "vitest";

import { awsCronFieldSpecs } from "./cron/sim-cron-field-spec.js";
import { SimSchedule } from "./sim-schedule.js";
import type { SimScheduleDialect } from "./sim-schedule-dialect.js";

/**
 * A dialect insisting a rate's unit agrees with its value, as EventBridge does.
 */
const strict: SimScheduleDialect = {
  cronFields: awsCronFieldSpecs,
  requiresRateAgreement: true,
  allowsOneTime: false,
};

/**
 * A Sunday lunchtime, which is where these are asked from unless said
 * otherwise. Sunday matters, because it is what a weekday expression skips.
 */
const noon = new Date("2026-07-26T12:00:00.000Z");

/**
 * The next instant a schedule falls due after one, as an ISO string.
 */
function nextAfter(source: string, from = noon): string | undefined {
  return SimSchedule.of(source, strict).nextAfter(from)?.toISOString();
}

describe("SimSchedule cron expressions", () => {
  it("falls due at the absolute instants it names", () => {
    // Given the every-day-at-noon expression from AWS's own examples
    // When it is asked from noon, and from the noon it answers with
    // Then each answer is the next day, so it falls due once a day
    expect(nextAfter("cron(0 12 * * ? *)")).toBe("2026-07-27T12:00:00.000Z");
    expect(
      nextAfter("cron(0 12 * * ? *)", new Date("2026-07-27T12:00:00.000Z")),
    ).toBe("2026-07-28T12:00:00.000Z");
  });

  it("reads a step as every so many from where it starts", () => {
    expect(nextAfter("cron(0/15 * * * ? *)")).toBe("2026-07-26T12:15:00.000Z");
    expect(
      nextAfter("cron(0/15 * * * ? *)", new Date("2026-07-26T12:45:00.000Z")),
    ).toBe("2026-07-26T13:00:00.000Z");
  });

  it("reads a range of named days, skipping the weekend", () => {
    // Given six in the evening on weekdays, asked from a Sunday lunchtime
    // When the next occurrence is taken
    // Then it is Monday rather than that same Sunday evening
    expect(nextAfter("cron(0 18 ? * MON-FRI *)")).toBe(
      "2026-07-27T18:00:00.000Z",
    );
  });

  it("reads a range that wraps around the end of its field", () => {
    // Given AWS's own example of hours from ten at night to two in the morning
    // When the occurrence after eleven at night is taken
    // Then it is one in the morning, so the range covered the wrap rather than
    // covering nothing at all
    expect(
      nextAfter("cron(0 20-2 * * ? *)", new Date("2026-07-27T00:30:00.000Z")),
    ).toBe("2026-07-27T01:00:00.000Z");
  });

  it("reads a list of named months and a day of the month", () => {
    expect(nextAfter("cron(0 8 1 JAN,JUL ? *)")).toBe(
      "2027-01-01T08:00:00.000Z",
    );
  });

  it("has nothing left once its years have run out", () => {
    // Given an expression naming only a year in the past
    // When it is asked when it is next due
    // Then there is no answer, rather than a search that never ends
    expect(nextAfter("cron(0 12 * * ? 1971)")).toBeUndefined();
  });
});
