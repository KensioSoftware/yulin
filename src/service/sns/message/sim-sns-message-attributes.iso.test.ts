import { assertIdentical, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSnsMessageAttributes } from "./sim-sns-message-attributes.js";

describe("SimSnsMessageAttributes", () => {
  it("weighs nothing when there are none", () => {
    // Given a publish carrying no message attributes.
    // When they are read.
    const attributes = SimSnsMessageAttributes.of(undefined);

    // Then they add nothing to what the publish weighs.
    assertIdentical(attributes.byteSize, 0);
  });

  it("weighs each attribute's name, type and value", () => {
    // Given one attribute.
    const attributes = SimSnsMessageAttributes.of({
      tenant: { DataType: "String", StringValue: "acme" },
    });

    // When it is weighed.
    // Then all three parts of it count, since all three travel.
    assertIdentical(attributes.byteSize, "tenant".length + 6 + "acme".length);
  });

  it("refuses an attribute name carrying a character real SNS refuses", () => {
    // Given an attribute name with a space in it.
    // When it is read.
    const error = assertThrowsError(() => {
      SimSnsMessageAttributes.of({
        "tenant name": { DataType: "String", StringValue: "acme" },
      });
    });

    // Then it is refused, since a name may only carry alphanumerics,
    // underscores, hyphens and periods.
    assertIdentical(error.name, "InvalidParameterValueException");
  });

  it("refuses an attribute name that begins or ends with a period", () => {
    // Given attribute names real SNS refuses for their periods.
    for (const name of [".tenant", "tenant.", "ten..ant"]) {
      // When each is read.
      const error = assertThrowsError(() => {
        SimSnsMessageAttributes.of({
          [name]: { DataType: "String", StringValue: "acme" },
        });
      });

      // Then it is refused, though the characters themselves are allowed.
      assertIdentical(error.name, "InvalidParameterValueException");
    }
  });

  it("refuses an attribute with no data type at all", () => {
    // Given an attribute that declares no data type.
    // When it is read.
    const error = assertThrowsError(() => {
      SimSnsMessageAttributes.of({ tenant: { StringValue: "acme" } });
    });

    // Then it is refused rather than guessed at.
    assertIdentical(error.name, "InvalidParameterValueException");
  });
});
