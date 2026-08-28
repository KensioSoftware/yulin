import { describe, expect, it } from "vitest";

import { SimDuration, SimInvalidDuration } from "./sim-duration.js";

describe("SimDuration", () => {
  it("adds its components together", () => {
    // Given a duration written as more than one component
    const duration = SimDuration.of({ hours: 1, minutes: 30 });

    // When it is measured in milliseconds
    // Then the components have added together
    expect(duration.toMilliseconds()).toBe(90 * 60 * 1000);
  });

  it("supports every component down to milliseconds", () => {
    // Given a duration using every component
    const duration = SimDuration.of({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
      milliseconds: 5,
    });

    // When it is measured in milliseconds
    // Then each component has contributed its own unit
    expect(duration.toMilliseconds()).toBe(
      24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000 + 3 * 60 * 1000 + 4000 + 5,
    );
  });

  it("treats an empty duration as no time at all", () => {
    // Given a duration with no components
    // When it is measured
    // Then it is zero rather than an error
    expect(SimDuration.of({}).toMilliseconds()).toBe(0);
  });

  it("builds from a plain number of milliseconds", () => {
    // Given a duration built from milliseconds
    // When it is measured
    // Then it reports them back
    expect(SimDuration.ofMilliseconds(250).toMilliseconds()).toBe(250);
  });

  it("reads a bare number as milliseconds", () => {
    // Given a duration written as a bare number, as setTimeout takes one
    const duration = SimDuration.of(3_600_000);

    // When it is measured
    // Then the number counted as milliseconds
    expect(duration.toMilliseconds()).toBe(60 * 60 * 1000);
  });

  it("refuses a bare number that cannot describe elapsed time", () => {
    // Given durations written as numbers that are negative or not finite
    // When they are built
    // Then they are refused as their millisecond components would be
    expect(() => SimDuration.of(-1)).toThrow(SimInvalidDuration);
    expect(() => SimDuration.of(-1)).toThrow(/milliseconds/);
    expect(() => SimDuration.of(NaN)).toThrow(SimInvalidDuration);
  });

  it("passes an existing duration through", () => {
    // Given a duration that has already been built
    const duration = SimDuration.of({ seconds: 30 });

    // When it is built from again
    // Then it is the same duration rather than a copy
    expect(SimDuration.of(duration)).toBe(duration);
  });

  it("refuses a negative component", () => {
    // Given a duration asking for negative elapsed time
    // When it is built
    // Then it is refused: time passing only runs forwards
    expect(() => SimDuration.of({ minutes: -1 })).toThrow(SimInvalidDuration);
    expect(() => SimDuration.of({ minutes: -1 })).toThrow(/minutes/);
  });

  it("refuses a component that is not a finite number", () => {
    // Given a duration whose component cannot describe an amount of time
    // When it is built
    // Then it is refused rather than producing an invalid Date later
    expect(() => SimDuration.of({ seconds: NaN })).toThrow(SimInvalidDuration);
    expect(() => SimDuration.of({ hours: Infinity })).toThrow(/hours/);
  });
});
