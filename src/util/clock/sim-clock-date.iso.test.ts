import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimClockDate } from "./sim-clock-date.js";
import { SimFixedClock } from "./sim-clock.js";
import { SimControllableClock } from "./sim-controllable-clock.js";

const instant = new Date("2026-01-01T00:00:00.000Z");

/**
 * A Date bound to a clock stopped at a known instant.
 */
function fixedClockDate(): DateConstructor {
  return makeSimClockDate(new SimFixedClock(instant));
}

describe("sim clock Date", () => {
  it("reports the clock's time from now()", () => {
    // Given a Date bound to a clock stopped at a known instant.
    const simDate = fixedClockDate();

    // When the current time is read.
    // Then it is the clock's time rather than the host's.
    assertIdentical(simDate.now(), instant.getTime());
  });

  it("builds the clock's time with no constructor arguments", () => {
    // Given a Date bound to a clock stopped at a known instant.
    const simDate = fixedClockDate();

    // When a date is built without saying which instant it wants.
    const built = new simDate();

    // Then it is the clock's instant.
    assertIdentical(built.toISOString(), "2026-01-01T00:00:00.000Z");
  });

  it("leaves a date built from an explicit instant alone", () => {
    // Given a Date bound to a clock stopped at a known instant.
    const simDate = fixedClockDate();

    // When a date states the instant it wants.
    const stated = new simDate("2020-03-12T19:03:58.000Z");
    const fromParts = new simDate(Date.UTC(2020, 2, 12));

    // Then the clock has nothing to do with it.
    assertIdentical(stated.toISOString(), "2020-03-12T19:03:58.000Z");
    assertIdentical(fromParts.toISOString(), "2020-03-12T00:00:00.000Z");
  });

  it("keeps dates recognisable as dates", () => {
    // Given a Date bound to a clock.
    const simDate = fixedClockDate();

    // When dates from either constructor are checked against either.
    // Then both are dates: the substitute shares one Date identity with the
    // host, so nothing stops recognising a date it is handed.
    assertInstanceOf(new simDate(), Date);
    assertInstanceOf(new Date(), simDate);
    assertIdentical(simDate.prototype, Date.prototype);
  });

  it("keeps the Date statics that do not ask for the time", () => {
    // Given a Date bound to a clock.
    const simDate = fixedClockDate();

    // When the statics that state their own instant are used.
    // Then they behave exactly as the host's do.
    assertIdentical(
      simDate.parse("2020-03-12T19:03:58.000Z"),
      Date.parse("2020-03-12T19:03:58.000Z"),
    );
    assertIdentical(simDate.UTC(2020, 2, 12), Date.UTC(2020, 2, 12));
  });

  it("reports the clock's time when called without new", () => {
    // Given a Date bound to a clock stopped at a known instant.
    const simDate = fixedClockDate();

    // When Date is called as a function, which reports a string.
    // Then it is the clock's instant.
    assertIdentical(simDate(), new Date(instant).toString());
  });

  it("follows the clock as it moves", () => {
    // Given a Date bound to a controllable clock.
    const clock = new SimControllableClock();
    clock.setTo(instant);
    const simDate = fixedClockDate();
    const movingDate = makeSimClockDate(clock);

    // When the clock is advanced after the Date was built.
    clock.advanceBy({ hours: 1 });

    // Then the substitute reads the clock again rather than a captured time.
    assertIdentical(movingDate.now(), instant.getTime() + 60 * 60 * 1000);
    // And a Date bound to a stopped clock still reports its own instant.
    assertIdentical(simDate.now(), instant.getTime());
  });
});
