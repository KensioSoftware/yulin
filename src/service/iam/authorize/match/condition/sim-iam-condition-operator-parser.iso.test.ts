import {
  assertArrayEquals,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIamConditionOperatorParser } from "./sim-iam-condition-operator-parser.js";

/**
 * Every comparison keyword the IAM condition operator reference lists.
 */
const documentedKeywords = [
  "StringEquals",
  "StringNotEquals",
  "StringEqualsIgnoreCase",
  "StringNotEqualsIgnoreCase",
  "StringLike",
  "StringNotLike",
  "NumericEquals",
  "NumericNotEquals",
  "NumericLessThan",
  "NumericLessThanEquals",
  "NumericGreaterThan",
  "NumericGreaterThanEquals",
  "DateEquals",
  "DateNotEquals",
  "DateLessThan",
  "DateLessThanEquals",
  "DateGreaterThan",
  "DateGreaterThanEquals",
  "Bool",
  "BinaryEquals",
  "IpAddress",
  "NotIpAddress",
  "ArnEquals",
  "ArnLike",
  "ArnNotEquals",
  "ArnNotLike",
];

const negatedKeywords = [
  "ArnNotEquals",
  "ArnNotLike",
  "StringNotEquals",
  "StringNotLike",
  "NumericNotEquals",
  "NotIpAddress",
];

const positiveKeywords = ["StringEquals", "StringLike", "DateLessThan", "Bool"];

/**
 * A policy value to ask the absent-key question with.
 *
 * Only `Null` reads the value it is asked about. Every comparison operator
 * answers the same way whatever the policy says.
 */
const policyValue = "arn:aws:iam::123456789012:role/OrdersService";

describe("sim IAM condition operator parsing", () => {
  it("has an operator for every documented keyword in every form", () => {
    // Given the keywords the IAM condition operator reference lists
    const parser = new SimIamConditionOperatorParser();

    // When each is parsed unqualified, in both set forms, and with IfExists
    const forms = documentedKeywords.flatMap((keyword) => [
      keyword,
      `ForAnyValue:${keyword}`,
      `ForAllValues:${keyword}`,
      `${keyword}IfExists`,
      `ForAllValues:${keyword}IfExists`,
    ]);

    // Then each yields an operator
    for (const form of forms) {
      assertNonNullable(parser.parse(form), form);
    }
  });

  it("matches an absent context key everywhere but the ForAnyValue forms of a negated keyword", () => {
    // Given the negated keywords
    const parser = new SimIamConditionOperatorParser();

    // When each form is asked whether an absent context key matches it
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
    // Given positive keywords
    const parser = new SimIamConditionOperatorParser();

    // When each form is asked whether an absent context key matches it
    const matchesAbsentKey = positiveKeywords.flatMap((keyword) => [
      parser.parse(keyword)?.matchesAbsentKey(policyValue),
      parser.parse(`ForAllValues:${keyword}`)?.matchesAbsentKey(policyValue),
      parser.parse(`ForAnyValue:${keyword}`)?.matchesAbsentKey(policyValue),
    ]);

    // Then only the `ForAllValues` forms answer true
    assertArrayEquals(
      matchesAbsentKey,
      positiveKeywords.flatMap(() => [false, true, false]),
    );
  });

  it("matches an absent context key in every IfExists form", () => {
    // Given the parser
    const parser = new SimIamConditionOperatorParser();

    // When the IfExists form of each keyword is asked about an absent key
    const matchesAbsentKey = documentedKeywords.flatMap((keyword) => [
      parser.parse(`${keyword}IfExists`)?.matchesAbsentKey(policyValue),
      parser
        .parse(`ForAnyValue:${keyword}IfExists`)
        ?.matchesAbsentKey(policyValue),
    ]);

    // Then every one answers true, which is what the suffix is for
    assertTrue(matchesAbsentKey.every((matches) => matches === true));
  });

  it("reads a Null policy value rather than answering a constant", () => {
    // Given the parser
    const parser = new SimIamConditionOperatorParser();

    // When `Null` is asked whether an absent context key matches each of the
    // two values AWS documents for it
    const operator = parser.parse("Null");

    // Then the answer follows the policy value
    assertTrue(operator?.matchesAbsentKey("true") === true);
    assertTrue(operator?.matchesAbsentKey("false") === false);
  });

  it.each([
    "NullIfExists",
    "ForAnyValue:Null",
    "ForEveryValue:StringEquals",
    "ForAnyValue:ForAllValues:StringEquals",
    "DateAfter",
    "stringequals",
  ])("has no operator for %s, which IAM does not define", (keyword) => {
    // Given the parser
    const parser = new SimIamConditionOperatorParser();

    // When a keyword IAM does not define is parsed
    const operator = parser.parse(keyword);

    // Then nothing comes back, leaving the statement holding it to fail closed
    assertUndefined(operator);
  });
});
