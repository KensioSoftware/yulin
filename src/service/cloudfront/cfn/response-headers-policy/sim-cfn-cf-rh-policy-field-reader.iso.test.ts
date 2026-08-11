import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  optionalObject,
  requiredBoolean,
  requiredNumber,
  requiredString,
  sectionItems,
} from "./sim-cfn-cf-rh-policy-field-reader.js";

describe("sim-cfn-cf-rh-policy-field-reader", () => {
  function refuse(detail: string): never {
    throw new Error(`Invalid: ${detail}`);
  }

  it("reads a required string", () => {
    assertIdentical(
      requiredString({ Name: "foo" }, "Name", "Config", refuse),
      "foo",
    );
    assertStringIncludes(
      assertThrowsError(() => requiredString({}, "Name", "Config", refuse))
        .message,
      "Config needs a string Name",
    );
  });

  it("reads a required number", () => {
    assertIdentical(requiredNumber({ Age: 5 }, "Age", "Config", refuse), 5);
    assertStringIncludes(
      assertThrowsError(() => requiredNumber({}, "Age", "Config", refuse))
        .message,
      "Config needs a number Age",
    );
  });

  it("reads a required boolean", () => {
    assertTrue(requiredBoolean({ Enabled: true }, "Enabled", "Config", refuse));
    assertStringIncludes(
      assertThrowsError(() => requiredBoolean({}, "Enabled", "Config", refuse))
        .message,
      "Config needs a boolean Enabled",
    );
  });

  it("reads an optional object field", () => {
    assertIdentical(
      optionalObject({ Nested: { a: 1 } }, "Nested", "Config", refuse)?.["a"],
      1,
    );
    assertUndefined(optionalObject({}, "Nested", "Config", refuse));
    assertStringIncludes(
      assertThrowsError(() =>
        optionalObject({ Nested: "nope" }, "Nested", "Config", refuse),
      ).message,
      "Config must be an object",
    );
  });

  it("reads a section's Items", () => {
    assertIdentical(
      sectionItems({ Section: { Items: ["a"] } }, "Section", refuse)[0],
      "a",
    );
  });

  it("reads no Items from an absent section, or a section without them", () => {
    // Given a section that is not there at all, and one present but empty:
    // CloudFormation allows both, and each means the section adds nothing.
    assertArrayLength(sectionItems({}, "Section", refuse), 0);
    assertArrayLength(sectionItems({ Section: {} }, "Section", refuse), 0);
  });

  it("refuses Items that are not an array", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        sectionItems({ Section: { Items: "nope" } }, "Section", refuse),
      ).message,
      "Section Items must be an array",
    );
  });
});
