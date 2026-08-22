import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { parseSimStatesDefinition } from "./sim-states-definition-parse.js";

/**
 * Read a definition that is expected to be refused, and answer with why.
 */
function refusalFor(definition: object | string): string {
  return assertThrowsError(() =>
    parseSimStatesDefinition(
      typeof definition === "string" ? definition : JSON.stringify(definition),
    ),
  ).message;
}

describe("Step Functions state refusals", () => {
  it("refuses a state with no Type, a Type that is not an object", () => {
    // Given malformed states.
    // When each is read, each is refused.
    assertStringIncludes(
      refusalFor({ StartAt: "Only", States: { Only: {} } }),
      "has no Type",
    );
    assertStringIncludes(
      refusalFor({ StartAt: "Only", States: { Only: "Pass" } }),
      "is not an object",
    );
  });

  it("refuses a Type Amazon States Language does not define", () => {
    // Given a state type that does not exist.
    // When it is read, it is told apart from one that is merely unsimulated.
    assertStringIncludes(
      refusalFor({ StartAt: "Only", States: { Only: { Type: "Wander" } } }),
      "does not define",
    );
  });

  it("refuses the fields a Fail or a Succeed state does not have", () => {
    // Given data-flow fields on states that have no input or output
    // processing.
    // When each is read, each names the field and the type.
    assertStringIncludes(
      refusalFor({
        StartAt: "Only",
        States: { Only: { Type: "Fail", InputPath: "$.student" } },
      }),
      "The Fail state Only carries InputPath",
    );
    assertStringIncludes(
      refusalFor({
        StartAt: "Only",
        States: { Only: { Type: "Succeed", ResultPath: "$.check" } },
      }),
      "The Succeed state Only carries ResultPath",
    );
  });
});
