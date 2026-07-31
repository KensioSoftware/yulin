import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbNumber } from "./sim-dynamodb-number.js";

describe("SimDynamoDbNumber", () => {
  it.each([
    { given: "42", expected: "42" },
    { given: "-42", expected: "-42" },
    { given: "0", expected: "0" },
    { given: "-0", expected: "0" },
    { given: "0.5", expected: "0.5" },
    { given: "-0.1", expected: "-0.1" },
    // Leading and trailing zeros are trimmed, as DynamoDB trims them.
    { given: "007", expected: "7" },
    { given: "1.500", expected: "1.5" },
    { given: "1.0", expected: "1" },
    { given: "0.0", expected: "0" },
    // An exponent is worked back into plain notation.
    { given: "1E5", expected: "100000" },
    { given: "1.5e3", expected: "1500" },
    { given: "15e-3", expected: "0.015" },
    { given: "-2E+2", expected: "-200" },
    // A number a double cannot hold keeps every digit it was given.
    { given: "9007199254740993", expected: "9007199254740993" },
    {
      given: "99999999999999999999999999999999999999",
      expected: "99999999999999999999999999999999999999",
    },
    { given: "0.30000000000000004", expected: "0.30000000000000004" },
  ])("normalises $given to $expected", ({ given, expected }) => {
    // When a number is read from the text a request carries.
    const number = SimDynamoDbNumber.of(given);

    // Then it keeps its digits.
    assertIdentical(number.text, expected);
  });

  it("keeps 38 significant digits through a round trip", () => {
    // Given the widest number DynamoDB holds.
    const given = "1.2345678901234567890123456789012345678";

    // When it is read.
    const number = SimDynamoDbNumber.of(given);

    // Then nothing about it has changed.
    assertIdentical(number.text, given);
    assertIdentical(number.significantDigits, 38);
  });

  it("refuses a number with more than 38 significant digits", () => {
    // When a 39 digit number is read.
    const error = assertThrowsError(() =>
      SimDynamoDbNumber.of("123456789012345678901234567890123456789"),
    );

    // Then it is refused, rather than rounded to fit.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "39 significant digits");
  });

  it("takes the numbers at the edges of the range", () => {
    // When the smallest and largest magnitudes DynamoDB holds are read.
    const smallest = SimDynamoDbNumber.of("1E-130");
    const largest = SimDynamoDbNumber.of(
      "9.9999999999999999999999999999999999999E+125",
    );

    // Then both are accepted.
    assertStringIncludes(smallest.text, "0.0000000000000000000000000000000");
    assertStringIncludes(
      largest.text,
      "99999999999999999999999999999999999999",
    );
  });

  it.each([
    { given: "1E-131", why: "smaller than DynamoDB holds" },
    { given: "1E126", why: "larger than DynamoDB holds" },
    { given: "-1E126", why: "larger than DynamoDB holds, negatively" },
  ])("refuses $given, which is $why", ({ given }) => {
    // When a number outside the range is read.
    const error = assertThrowsError(() => SimDynamoDbNumber.of(given));

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "outside the range DynamoDB stores");
  });

  it.each(["", "1.2.3", "twelve", "0x10", " 1", "1 ", "1,000", "Infinity"])(
    "refuses '%s', which is not a number",
    (given) => {
      // When something that is not a number is read.
      const error = assertThrowsError(() => SimDynamoDbNumber.of(given));

      // Then it is refused.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringIncludes(
        error.message,
        "cannot be converted to a numeric value",
      );
    },
  );

  it("counts about a byte per two significant digits", () => {
    // Then a number's size follows what DynamoDB documents for it.
    assertIdentical(SimDynamoDbNumber.of("0").sizeInBytes, 2);
    assertIdentical(SimDynamoDbNumber.of("1234").sizeInBytes, 3);
    assertIdentical(SimDynamoDbNumber.of("12345").sizeInBytes, 4);
  });
});
