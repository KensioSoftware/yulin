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

describe("Step Functions definition refusals", () => {
  it("refuses a definition that is not a JSON object", () => {
    // Given text that will not parse, and JSON that is not an object.
    // When each is read, each is refused.
    assertStringIncludes(refusalFor("not json"), "not JSON");
    assertStringIncludes(refusalFor("[]"), "a JSON object");
  });

  it("refuses a definition with no states or no StartAt", () => {
    // Given definitions missing what every state machine needs.
    // When each is read, each names what is missing.
    assertStringIncludes(
      refusalFor({ StartAt: "Only", States: {} }),
      "at least one state",
    );
    assertStringIncludes(
      refusalFor({ States: { Only: { Type: "Succeed" } } }),
      "needs a StartAt",
    );
  });

  it("refuses a StartAt or a Next naming a state that is not there", () => {
    // Given transitions pointing at nothing.
    // When each is read, each names the state it could not find.
    assertStringIncludes(
      refusalFor({ StartAt: "Absent", States: { Only: { Type: "Succeed" } } }),
      "StartAt names Absent",
    );
    assertStringIncludes(
      refusalFor({
        StartAt: "Only",
        States: { Only: { Type: "Pass", Next: "Absent" } },
      }),
      "moves to Absent",
    );
  });

  it("refuses a state that says nothing about what happens after it", () => {
    // Given a Pass state carrying neither Next nor End, and one carrying both.
    // When each is read, each is refused.
    assertStringIncludes(
      refusalFor({ StartAt: "Only", States: { Only: { Type: "Pass" } } }),
      "neither Next nor End",
    );
    assertStringIncludes(
      refusalFor({
        StartAt: "Only",
        States: {
          Only: { Type: "Pass", Next: "Other", End: true },
          Other: { Type: "Succeed" },
        },
      }),
      "both Next and End",
    );
  });

  it("refuses a terminal state carrying a Next", () => {
    // Given a Succeed state that also moves on.
    // When it is read, the contradiction is refused.
    assertStringIncludes(
      refusalFor({
        StartAt: "Only",
        States: {
          Only: { Type: "Succeed", Next: "Other" },
          Other: { Type: "Succeed" },
        },
      }),
      "ends the execution",
    );
  });

  it("refuses a terminal state carrying an End", () => {
    // Given a Succeed state that also says it ends.
    // When it is read, the field it does not have is refused.
    assertStringIncludes(
      refusalFor({
        StartAt: "Only",
        States: { Only: { Type: "Succeed", End: true } },
      }),
      "carries End",
    );
  });

  it("refuses an End that is not a boolean", () => {
    // Given a Pass state whose End is a string.
    // When it is read, it is refused for what it is rather than for being
    // absent.
    assertStringIncludes(
      refusalFor({
        StartAt: "Only",
        States: { Only: { Type: "Pass", End: "true" } },
      }),
      "End that is not a boolean",
    );
  });
});
