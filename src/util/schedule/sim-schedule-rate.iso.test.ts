import { describe, expect, it } from "vitest";

import { awsCronFieldSpecs } from "./cron/sim-cron-field-spec.js";
import { SimSchedule } from "./sim-schedule.js";
import type { SimScheduleDialect } from "./sim-schedule-dialect.js";
import { SimScheduleExpressionError } from "./sim-schedule.error.js";

/**
 * A dialect insisting a rate's unit agrees with its value, as EventBridge does.
 */
const strict: SimScheduleDialect = {
  cronFields: awsCronFieldSpecs,
  requiresRateAgreement: true,
};

/**
 * A dialect taking a rate however its unit is written.
 */
const lenient: SimScheduleDialect = {
  cronFields: awsCronFieldSpecs,
  requiresRateAgreement: false,
};

const noon = new Date("2026-07-26T12:00:00.000Z");

/**
 * The next instant a schedule falls due after one, as an ISO string.
 */
function nextAfter(source: string, from = noon): string | undefined {
  return SimSchedule.of(source, strict).nextAfter(from)?.toISOString();
}

describe("SimSchedule rate expressions", () => {
  it("falls due one interval on from wherever it is asked", () => {
    // Given a rate of an hour
    // When it is asked from half past nine
    // Then it is due at half past ten, not on the hour: a rate counts from
    // where it started rather than from a wall clock boundary.
    expect(
      nextAfter("rate(1 hour)", new Date("2026-07-26T09:30:00.000Z")),
    ).toBe("2026-07-26T10:30:00.000Z");
  });

  it("reads every unit AWS takes", () => {
    expect(nextAfter("rate(5 minutes)")).toBe("2026-07-26T12:05:00.000Z");
    expect(nextAfter("rate(2 hours)")).toBe("2026-07-26T14:00:00.000Z");
    expect(nextAfter("rate(3 days)")).toBe("2026-07-29T12:00:00.000Z");
  });

  it("refuses a unit that does not agree with its value", () => {
    // Given rates real EventBridge refuses for their plurals
    // When they are read under a dialect insisting on agreement
    // Then both are refused, naming the form that was wanted
    expect(() => nextAfter("rate(1 hours)")).toThrow(/'1 hour'/u);
    expect(() => nextAfter("rate(5 hour)")).toThrow(/'5 hours'/u);
  });

  it("takes either plural under a dialect that does not insist", () => {
    // Given the same expression under a lenient dialect
    // When it is read
    // Then it is an hour, which is what keeps one parser serving two services
    expect(
      SimSchedule.of("rate(1 hours)", lenient).nextAfter(noon)?.toISOString(),
    ).toBe("2026-07-26T13:00:00.000Z");
  });

  it("refuses a rate finer than the minute AWS runs", () => {
    // Given a rate in seconds, and a rate of no time at all
    // When each is read
    // Then both are refused: AWS has no unit under a minute
    expect(() => nextAfter("rate(30 seconds)")).toThrow(
      /no schedule finer than one a minute/u,
    );
    expect(() => nextAfter("rate(0 minutes)")).toThrow(
      SimScheduleExpressionError,
    );
  });

  it("refuses a rate that is not a value and a unit", () => {
    expect(() => nextAfter("rate(hour)")).toThrow(/value and a unit/u);
    expect(() => nextAfter("rate(1 hour or so)")).toThrow(/value and a unit/u);
  });
});

describe("SimSchedule expression forms", () => {
  it("keeps the expression as it was written", () => {
    expect(SimSchedule.of("rate(1 hour)", strict).source).toBe("rate(1 hour)");
  });

  it("refuses anything that is not a rate or a cron", () => {
    expect(() => nextAfter("every(1 hour)")).toThrow(/'every\(\.\.\.\)'/u);
    expect(() => nextAfter("at 12:00")).toThrow(
      /'rate\(<value> <unit>\)' or 'cron\(<fields>\)'/u,
    );
  });
});
