import { describe, expect, it } from "vitest";

import { SimFixedClock, SimRealClock } from "./sim-clock.js";

describe("SimRealClock", () => {
  it("reports the real system time", () => {
    // Given a clock reading the real system time
    const clock = new SimRealClock();

    // When it is read either side of a known instant
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();

    // Then it reports a time between the two
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("SimFixedClock", () => {
  it("reports the same instant however often it is read", () => {
    // Given a clock stopped at a known instant
    const instant = new Date("2026-07-26T09:30:00.000Z");
    const clock = new SimFixedClock(instant);

    // When it is read more than once
    const first = clock.now();
    const second = clock.now();

    // Then both readings are that instant
    expect(first).toStrictEqual(instant);
    expect(second).toStrictEqual(instant);
  });

  it("does not hand out its own instant to be mutated", () => {
    // Given a clock stopped at a known instant
    const instant = new Date("2026-07-26T09:30:00.000Z");
    const clock = new SimFixedClock(instant);

    // When a caller mutates a reading, and the source Date is mutated too
    clock.now().setFullYear(1999);
    instant.setFullYear(1999);

    // Then the clock still reports the instant it was built with
    expect(clock.now().toISOString()).toBe("2026-07-26T09:30:00.000Z");
  });
});
