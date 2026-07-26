import { describe, expect, it } from "vitest";

import { type SimClock, SimFixedClock } from "./sim-clock.js";
import { SimControllableClock } from "./sim-controllable-clock.js";

const start = new Date("2026-07-26T09:00:00.000Z");

/**
 * A stand-in for the host clock, so a test can make real time pass without
 * actually waiting for it.
 */
class MovableClock implements SimClock {
  private instant: Date;

  constructor(instant: Date) {
    this.instant = new Date(instant);
  }

  now(): Date {
    return new Date(this.instant);
  }

  moveOn(milliseconds: number): void {
    this.instant = new Date(this.instant.getTime() + milliseconds);
  }
}

describe("SimControllableClock", () => {
  it("follows the real clock until something moves it", () => {
    // Given a clock with no base of its own
    const clock = new SimControllableClock();

    // When it is read
    // Then it reports the real system time, and time is still passing
    expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1000);
    expect(clock.isFrozen).toBe(false);
  });

  it("follows the clock it is given", () => {
    // Given a clock measured against a stopped clock
    const clock = new SimControllableClock({ base: new SimFixedClock(start) });

    // When it is read
    // Then it reports that clock's time
    expect(clock.now()).toStrictEqual(start);
  });

  it("reports the same time once frozen, however much time really passes", () => {
    // Given a clock frozen at the time it currently reads
    const base = new MovableClock(start);
    const clock = new SimControllableClock({ base });
    clock.freeze();

    // When an hour passes on the clock underneath
    base.moveOn(60 * 60 * 1000);

    // Then simulated time has not moved
    expect(clock.now()).toStrictEqual(start);
    expect(clock.isFrozen).toBe(true);
  });

  it("carries on from where it stopped when resumed", () => {
    // Given a clock that was frozen while an hour passed underneath
    const base = new MovableClock(start);
    const clock = new SimControllableClock({ base });
    clock.freeze();
    base.moveOn(60 * 60 * 1000);

    // When it is resumed and half an hour more passes underneath
    clock.resume();
    base.moveOn(30 * 60 * 1000);

    // Then time runs again from the frozen instant, not from the real one
    expect(clock.isFrozen).toBe(false);
    expect(clock.now()).toStrictEqual(new Date("2026-07-26T09:30:00.000Z"));
  });

  it("keeps the offset once it has been advanced and resumed", () => {
    // Given a running clock advanced an hour ahead and resumed
    const base = new MovableClock(start);
    const clock = new SimControllableClock({ base });
    clock.advanceBy({ hours: 1 });
    clock.resume();

    // When a minute passes underneath
    base.moveOn(60 * 1000);

    // Then simulated time stays an hour ahead and keeps running
    expect(clock.now()).toStrictEqual(new Date("2026-07-26T10:01:00.000Z"));
  });

  it("stops where it is set", () => {
    // Given a running clock
    const base = new MovableClock(start);
    const clock = new SimControllableClock({ base });

    // When it is set to an instant and time passes underneath
    clock.setTo(new Date("2027-01-01T00:00:00.000Z"));
    base.moveOn(60 * 60 * 1000);

    // Then it reports that instant: setting time also stops it, so an
    // assertion cannot drift past the instant it asked for
    expect(clock.now()).toStrictEqual(new Date("2027-01-01T00:00:00.000Z"));
    expect(clock.isFrozen).toBe(true);
  });

  it("advances from a stopped base clock", () => {
    // Given a clock measured against a stopped clock
    const clock = new SimControllableClock({ base: new SimFixedClock(start) });

    // When it is advanced twice
    clock.advanceBy({ minutes: 20 });
    clock.advanceBy({ minutes: 10 });

    // Then the advances accumulate from the instant it started at
    expect(clock.now()).toStrictEqual(new Date("2026-07-26T09:30:00.000Z"));
  });

  it("does nothing when frozen or resumed twice", () => {
    // Given a clock frozen at a known instant
    const clock = new SimControllableClock({ base: new SimFixedClock(start) });
    clock.freeze();

    // When it is frozen again, then resumed twice
    clock.freeze();
    expect(clock.now()).toStrictEqual(start);
    clock.resume();
    clock.resume();

    // Then it still reports the same time and is running
    expect(clock.now()).toStrictEqual(start);
    expect(clock.isFrozen).toBe(false);
  });
});
