import { describe, expect, it } from "vitest";

import { awsCronFieldSpecs } from "./cron/sim-cron-field-spec.js";
import { SimSchedule } from "./sim-schedule.js";
import type { SimScheduleDialect } from "./sim-schedule-dialect.js";

/**
 * A dialect with one-time schedules, as EventBridge Scheduler has.
 */
const oneTime: SimScheduleDialect = {
  cronFields: awsCronFieldSpecs,
  requiresRateAgreement: false,
  allowsOneTime: true,
};

/**
 * A dialect without them, as an EventBridge rule is.
 */
const recurringOnly: SimScheduleDialect = {
  cronFields: awsCronFieldSpecs,
  requiresRateAgreement: true,
  allowsOneTime: false,
};

const noon = new Date("2026-07-26T12:00:00.000Z");

/**
 * The next instant a one-time schedule falls due after one.
 */
function nextAfter(source: string, from = noon): string | undefined {
  return SimSchedule.of(source, oneTime).nextAfter(from)?.toISOString();
}

describe("SimSchedule at expressions", () => {
  it("falls due at the instant it names", () => {
    // Given an instant later the same day
    // When it is asked when it is next due
    // Then it is that instant, read as UTC
    expect(nextAfter("at(2026-07-26T14:30:00)")).toBe(
      "2026-07-26T14:30:00.000Z",
    );
  });

  it("falls due once and never again", () => {
    // Given a one-time schedule asked from the instant it already fired at
    // When it is asked what comes next
    // Then there is nothing, which is what stops it being armed again
    expect(
      nextAfter("at(2026-07-26T14:30:00)", new Date("2026-07-26T14:30:00Z")),
    ).toBeUndefined();
  });

  it("does not fire for an instant already gone", () => {
    // Given a one-time schedule for this morning, asked at noon
    // When it is asked when it is next due
    // Then there is nothing: real Scheduler does not invoke a schedule
    // created for a time that has already passed
    expect(nextAfter("at(2026-07-26T09:00:00)")).toBeUndefined();
  });

  it("refuses an instant carrying a timezone", () => {
    // Given the same instant written with the trailing Z an ISO string has
    // When it is read
    // Then it is refused: AWS takes the bare form, and the timezone is a
    // setting on the schedule rather than part of the expression
    expect(() => nextAfter("at(2026-07-26T14:30:00Z)")).toThrow(
      /no timezone on it/u,
    );
  });

  it("refuses an instant that is not a real one", () => {
    expect(() => nextAfter("at(2026-02-30T14:30:00)")).toThrow(
      /an at expression names a real instant/u,
    );
  });

  it("refuses a one-time schedule under a dialect without them", () => {
    // Given the same expression read as an EventBridge rule would read it
    // When it is read
    // Then it is refused naming only the forms that dialect does take
    expect(() =>
      SimSchedule.of("at(2026-07-26T14:30:00)", recurringOnly).nextAfter(noon),
    ).toThrow(/a 'rate\(\.\.\.\)' or a 'cron\(\.\.\.\)'/u);
  });
});
