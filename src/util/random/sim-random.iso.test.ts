import {
  assertNotEqual,
  assertObjectEquals,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimHostRandom, SimSeededRandom } from "./sim-random.js";

describe("SimRandom sources", () => {
  /**
   * The first few values a source draws.
   */
  function drawn(random: { next(): number }, count: number): number[] {
    return Array.from({ length: count }, () => random.next());
  }

  it("repeats a seeded sequence from the same seed", () => {
    // Given two sources built from one seed.
    // When each draws the same number of values.
    // Then they drew the same values in the same order.
    assertObjectEquals(
      drawn(new SimSeededRandom(42), 20),
      drawn(new SimSeededRandom(42), 20),
    );
  });

  it("draws a different sequence from a different seed", () => {
    assertNotEqual(
      drawn(new SimSeededRandom(42), 5).join(","),
      drawn(new SimSeededRandom(43), 5).join(","),
    );
  });

  it("keeps every value at least 0 and below 1", () => {
    // Given seeded and host sources, drawing many values each.
    const values = [
      ...drawn(new SimSeededRandom(0), 10_000),
      ...drawn(new SimSeededRandom(-1), 10_000),
      ...drawn(new SimHostRandom(), 1000),
    ];

    // Then none of them falls outside the range a window draws from.
    assertTrue(values.every((value) => value >= 0 && value < 1));
  });
});
