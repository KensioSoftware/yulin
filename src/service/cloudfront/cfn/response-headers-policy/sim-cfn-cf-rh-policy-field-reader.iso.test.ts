import {
  assertArrayEmpty,
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
  requiredEnum,
  requiredInteger,
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

  it("reads a required whole number", () => {
    assertIdentical(requiredInteger({ Age: 5 }, "Age", "Config", refuse), 5);
    assertStringIncludes(
      assertThrowsError(() => requiredInteger({}, "Age", "Config", refuse))
        .message,
      "Config needs a whole number Age",
    );
  });

  it("refuses a number that is not a whole one", () => {
    // A template is often a JavaScript object here rather than parsed JSON, so
    // these can reach a reader where JSON could not carry them.
    for (const value of [1.5, NaN, Infinity]) {
      assertStringIncludes(
        assertThrowsError(() =>
          requiredInteger({ Age: value }, "Age", "Config", refuse),
        ).message,
        "Config needs a whole number Age",
      );
    }
  });

  it("reads one of a fixed set of values", () => {
    assertIdentical(
      requiredEnum(
        { Mode: "DENY" },
        "Mode",
        ["DENY", "SAMEORIGIN"],
        "Config",
        refuse,
      ),
      "DENY",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        requiredEnum(
          { Mode: "ALLOW" },
          "Mode",
          ["DENY", "SAMEORIGIN"],
          "Config",
          refuse,
        ),
      ).message,
      "Config Mode must be one of DENY, SAMEORIGIN",
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
    assertArrayEmpty(sectionItems({}, "Section", refuse));
    assertArrayEmpty(sectionItems({ Section: {} }, "Section", refuse));
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
