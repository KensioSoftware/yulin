import {
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

const setQualifiers = ["ForAnyValue", "ForAllValues"];

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

    // Then each yields an operator, and each of those matches a request
    // carrying no value for the key
    assertArrayLength(operators, negatedKeywords.length * 3);
    assertTrue(
      operators.every((operator) => operator?.matchesAbsentKey === true),
    );
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
