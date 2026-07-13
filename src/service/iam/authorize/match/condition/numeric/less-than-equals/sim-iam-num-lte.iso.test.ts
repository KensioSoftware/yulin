import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamNumericLessThanEquals } from "./sim-iam-num-lte.js";

describe("sim IAM NumericLessThanEquals authorization", () => {
  it("matches a numeric request value equal to the policy limit", () => {
    // Given a maximum numeric policy value.
    const operator = new SimIamNumericLessThanEquals();

    // When the request value equals that maximum.
    const matches = operator.matches(2, 2);

    // Then NumericLessThanEquals accepts the boundary value.
    assertTrue(matches);
  });

  it("matches numeric strings using numeric rather than lexical ordering", () => {
    // Given a numeric policy limit represented as JSON text.
    const operator = new SimIamNumericLessThanEquals();

    // When a smaller request value is also represented as text.
    const matches = operator.matches("2", "10");

    // Then the values are compared numerically.
    assertTrue(matches);
  });

  it("rejects a request value greater than every policy limit", () => {
    // Given multiple acceptable policy limits.
    const operator = new SimIamNumericLessThanEquals();

    // When the request value exceeds each limit.
    const matches = operator.matches(11, ["2", "10"]);

    // Then no policy value satisfies the comparison.
    assertFalse(matches);
  });

  it("rejects non-numeric values instead of coercing them", () => {
    // Given the NumericLessThanEquals operator.
    const operator = new SimIamNumericLessThanEquals();

    // When the request contains an empty non-numeric value.
    const matches = operator.matches("", 10);

    // Then the malformed numeric value fails closed.
    assertFalse(matches);
  });
});
