import {
  assertArrayEquals,
  assertArrayLength,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIamConditionOperatorParser } from "./sim-iam-condition-operator-parser.js";

const negatedKeywords = [
  "ArnNotEquals",
  "ArnNotLike",
  "StringNotEquals",
  "StringNotLike",
];

const positiveKeywords = ["StringEquals", "StringLike"];

const setQualifiers = ["ForAnyValue", "ForAllValues"];

/**
 * A policy value to ask the absent-key question with.
 *
 * Only `Null` reads the value it is asked about. Every comparison operator
 * answers the same way whatever the policy says.
 */
const policyValue = "arn:aws:iam::123456789012:role/OrdersService";

describe("sim IAM condition operator parsing", () => {
  it("has an operator for every form of every negated keyword", () => {
    // Given the keywords a service control policy writes a carve-out with
    const parser = new SimIamConditionOperatorParser();

    // When each is parsed unqualified and in both of its set forms
    const operators = negatedKeywords
      .flatMap((keyword) => [
        keyword,
        ...setQualifiers.map((qualifier) => `${qualifier}:${keyword}`),
      ])
      .map((keyword) => parser.parse(keyword));

    // Then each yields an operator
    assertArrayLength(operators, negatedKeywords.length * 3);
    assertTrue(operators.every((operator) => operator !== undefined));
  });

  it("matches an absent context key everywhere but the ForAnyValue forms", () => {
    // Given the same keywords
    const parser = new SimIamConditionOperatorParser();

    // When each form is asked whether an absent context key matches it. The
    // policy value goes unread by every operator but `Null`
    const matchesAbsentKey = negatedKeywords.flatMap((keyword) => [
      parser.parse(keyword)?.matchesAbsentKey(policyValue),
      parser.parse(`ForAllValues:${keyword}`)?.matchesAbsentKey(policyValue),
      parser.parse(`ForAnyValue:${keyword}`)?.matchesAbsentKey(policyValue),
    ]);

    // Then only the `ForAnyValue` forms answer false, because no request value
    // is there to satisfy them
    assertArrayEquals(
      matchesAbsentKey,
      negatedKeywords.flatMap(() => [true, true, false]),
    );
  });

  it("matches an absent context key only in the ForAllValues form of a positive keyword", () => {
    // Given the positive keywords carrying both set forms
    const parser = new SimIamConditionOperatorParser();

    // When each form is asked whether an absent context key matches it
    const matchesAbsentKey = positiveKeywords.flatMap((keyword) => [
      parser.parse(keyword)?.matchesAbsentKey(policyValue),
      parser.parse(`ForAllValues:${keyword}`)?.matchesAbsentKey(policyValue),
      parser.parse(`ForAnyValue:${keyword}`)?.matchesAbsentKey(policyValue),
    ]);

    // Then only the `ForAllValues` forms answer true. AWS matches those where
    // the request carries no value for the key
    assertArrayEquals(
      matchesAbsentKey,
      positiveKeywords.flatMap(() => [false, true, false]),
    );
  });

  it("reads a Null policy value rather than answering a constant", () => {
    // Given the parser
    const parser = new SimIamConditionOperatorParser();

    // When `Null` is asked whether an absent context key matches each of the
    // two values AWS documents for it
    const operator = parser.parse("Null");

    // Then the answer follows the policy value, which is the one operator that
    // reads it
    assertTrue(operator?.matchesAbsentKey("true") === true);
    assertTrue(operator?.matchesAbsentKey("false") === false);
  });

  it("has no operator for a keyword it cannot evaluate", () => {
    // Given the parser
    const parser = new SimIamConditionOperatorParser();

    // When a keyword sim IAM does not implement is parsed
    const operator = parser.parse("StringEqualsIgnoreCase");

    // Then nothing comes back, leaving the statement holding it to fail closed
    assertUndefined(operator);
  });
});
