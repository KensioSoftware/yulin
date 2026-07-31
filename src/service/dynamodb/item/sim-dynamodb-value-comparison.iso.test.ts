import {
  assertFalse,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimDynamoDbNumber } from "./sim-dynamodb-number.js";
import { simDynamoDbValuesEqual } from "./sim-dynamodb-value-comparison.js";
import { compareSimDynamoDbValues } from "./sim-dynamodb-value-order.js";
import type { SimDynamoDbValue } from "./sim-dynamodb-value.js";

function text(value: string): SimDynamoDbValue {
  return { kind: "S", text: value };
}

function number(value: string): SimDynamoDbValue {
  return { kind: "N", number: SimDynamoDbNumber.of(value) };
}

function binary(...bytes: number[]): SimDynamoDbValue {
  return { kind: "B", bytes: Uint8Array.from(bytes) };
}

function map(entries: Readonly<Record<string, string>>): SimDynamoDbValue {
  return {
    kind: "M",
    entries: new Map(
      Object.entries(entries).map(([name, value]) => [name, text(value)]),
    ),
  };
}

/**
 * Which way round two values go, as -1, 0 or 1.
 */
function order(
  first: SimDynamoDbValue,
  second: SimDynamoDbValue,
): number | undefined {
  return Math.sign(compareSimDynamoDbValues(first, second) ?? NaN);
}

describe("compareSimDynamoDbValues", () => {
  it("orders strings by their UTF-8 bytes", () => {
    // Given strings that differ in case and in accent, where UTF-8 puts the
    // capitals first and everything outside ASCII after them.
    // When they are ordered, then they follow those bytes rather than any
    // locale's idea of alphabetical order.
    assertIdentical(order(text("A"), text("a")), -1);
    assertIdentical(order(text("z"), text("é")), -1);
    assertIdentical(order(text("abc"), text("abc")), 0);
    assertIdentical(order(text("ab"), text("abc")), -1);
  });

  it("orders a character above the basic plane after one below it", () => {
    // Given a character that needs a surrogate pair in UTF-16 and one that
    // does not. JavaScript compares by code unit, which puts the pair first.
    // When they are ordered, then the higher code point comes second, as its
    // UTF-8 bytes do.
    assertIdentical(order(text("\u{1F600}"), text("�")), 1);
  });

  it("orders numbers by what they say rather than by what they round to", () => {
    // Given two numbers that differ past what a JavaScript number holds, which
    // would round to the same value.
    // When they are ordered, then they differ, because the digits are
    // compared rather than converted.
    assertIdentical(
      order(number("9007199254740993"), number("9007199254740992")),
      1,
    );
  });

  it("orders numbers across signs, scales and fractions", () => {
    // Given numbers on both sides of zero, of different lengths, and with
    // fractions of different lengths.
    // When they are ordered, then each goes where arithmetic puts it.
    assertIdentical(order(number("-1"), number("1")), -1);
    assertIdentical(order(number("1"), number("-1")), 1);
    assertIdentical(order(number("-10"), number("-2")), -1);
    assertIdentical(order(number("100"), number("99")), 1);
    assertIdentical(order(number("0.5"), number("0.45")), 1);
    assertIdentical(order(number("1.0"), number("1")), 0);
    assertIdentical(order(number("0"), number("-0")), 0);
    assertIdentical(order(number("1e2"), number("100")), 0);
  });

  it("orders binary as unsigned bytes", () => {
    // Given bytes that differ where a signed comparison would disagree, since
    // 0x80 is negative as a signed byte and above 0x01 as an unsigned one.
    // When they are ordered, then the unsigned order wins.
    assertIdentical(order(binary(0x80), binary(0x01)), 1);
    assertIdentical(order(binary(1, 2), binary(1, 2, 0)), -1);
    assertIdentical(order(binary(1, 2), binary(1, 2)), 0);
  });

  it("has no order between two different types", () => {
    // Given a string and a number, which DynamoDB does not order against each
    // other.
    // When they are compared, then there is no order, which is what makes a
    // comparison between them false rather than an error.
    assertUndefined(compareSimDynamoDbValues(text("1"), number("1")));
    assertUndefined(
      compareSimDynamoDbValues({ kind: "BOOL", boolean: true }, text("true")),
    );
  });

  it("has no order for a type DynamoDB does not order", () => {
    // Given two booleans, which are equal or not rather than greater or less.
    // When they are compared, then there is no order.
    assertUndefined(
      compareSimDynamoDbValues(
        { kind: "BOOL", boolean: true },
        { kind: "BOOL", boolean: false },
      ),
    );
  });
});

describe("simDynamoDbValuesEqual", () => {
  it("compares scalars by value rather than by how they were written", () => {
    // Given values written differently for the same thing.
    // When they are compared, then they are equal.
    assertTrue(simDynamoDbValuesEqual(number("1.0"), number("1")));
    assertTrue(simDynamoDbValuesEqual(binary(1, 2), binary(1, 2)));
    assertTrue(simDynamoDbValuesEqual({ kind: "NULL" }, { kind: "NULL" }));
    assertTrue(
      simDynamoDbValuesEqual(
        { kind: "BOOL", boolean: false },
        { kind: "BOOL", boolean: false },
      ),
    );
    assertFalse(
      simDynamoDbValuesEqual(
        { kind: "BOOL", boolean: true },
        { kind: "BOOL", boolean: false },
      ),
    );
  });

  it("is never equal across two types", () => {
    // Given a string and a number holding the same characters.
    // When they are compared, then they are not equal, which is what makes an
    // `=` between them false rather than an error.
    assertFalse(simDynamoDbValuesEqual(text("1"), number("1")));
  });

  it("compares a set by its members rather than by their order", () => {
    // Given two sets holding the same members in different orders, which is
    // the same set: a set has no order.
    // When they are compared, then they are equal.
    assertTrue(
      simDynamoDbValuesEqual(
        { kind: "SS", texts: ["a", "b"] },
        { kind: "SS", texts: ["b", "a"] },
      ),
    );
    assertFalse(
      simDynamoDbValuesEqual(
        { kind: "SS", texts: ["a", "b"] },
        { kind: "SS", texts: ["a"] },
      ),
    );
    assertFalse(
      simDynamoDbValuesEqual(
        { kind: "SS", texts: ["a", "b"] },
        { kind: "SS", texts: ["a", "c"] },
      ),
    );
  });

  it("compares number and binary sets by value", () => {
    // Given sets whose members compare by their digits and by their bytes
    // rather than by how they were written or by object identity.
    // When they are compared, then they are equal.
    assertTrue(
      simDynamoDbValuesEqual(
        { kind: "NS", numbers: [SimDynamoDbNumber.of("1.0")] },
        { kind: "NS", numbers: [SimDynamoDbNumber.of("1")] },
      ),
    );
    assertTrue(
      simDynamoDbValuesEqual(
        { kind: "BS", bytes: [Uint8Array.from([1])] },
        { kind: "BS", bytes: [Uint8Array.from([1])] },
      ),
    );
  });

  it("compares a list by its elements in order", () => {
    // Given lists holding the same elements in different orders, which is not
    // the same list: a list has an order.
    // When they are compared, then only the matching one is equal.
    assertTrue(
      simDynamoDbValuesEqual(
        { kind: "L", values: [text("a"), number("1")] },
        { kind: "L", values: [text("a"), number("1")] },
      ),
    );
    assertFalse(
      simDynamoDbValuesEqual(
        { kind: "L", values: [text("a"), text("b")] },
        { kind: "L", values: [text("b"), text("a")] },
      ),
    );
    assertFalse(
      simDynamoDbValuesEqual(
        { kind: "L", values: [text("a")] },
        { kind: "L", values: [text("a"), text("b")] },
      ),
    );
  });

  it("compares a map by its attributes and their values", () => {
    // Given maps holding the same attributes, and maps that differ by one.
    // When they are compared, then only the matching one is equal.
    const leeds = map({ city: "Leeds" });

    assertTrue(simDynamoDbValuesEqual(leeds, map({ city: "Leeds" })));
    assertFalse(simDynamoDbValuesEqual(leeds, map({ city: "York" })));
    assertFalse(simDynamoDbValuesEqual(leeds, map({ town: "Leeds" })));
    assertFalse(simDynamoDbValuesEqual(leeds, map({})));
  });
});
