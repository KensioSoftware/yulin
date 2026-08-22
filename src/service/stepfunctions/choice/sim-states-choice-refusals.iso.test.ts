import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { parseSimStatesDefinition } from "../definition/sim-states-definition-parse.js";

describe("Step Functions Choice refusals", () => {
  /**
   * Read a definition whose Choice state is expected to be refused, and answer
   * with why.
   */
  function refusalFor(choice: JSONObject): string {
    return assertThrowsError(() =>
      parseSimStatesDefinition(
        JSON.stringify({
          StartAt: "Eligible",
          States: {
            Eligible: { Type: "Choice", ...choice },
            Enrol: { Type: "Succeed" },
          },
        }),
      ),
    ).message;
  }

  /**
   * The same, for a Choice state carrying one rule.
   */
  function refusalForRule(rule: JSONValue): string {
    return refusalFor({ Choices: [rule] });
  }

  it("refuses a Choice state with nothing to choose between", () => {
    // Given Choices that are missing, empty, or not an array at all.
    // When each is read, each is refused.
    assertStringIncludes(refusalFor({}), "carries no Choices");
    assertStringIncludes(refusalFor({ Choices: [] }), "carries no Choices");
    assertStringIncludes(
      refusalFor({ Choices: "Enrol" }),
      "carries no Choices",
    );
  });

  it("refuses a rule that does not say where a match goes", () => {
    // Given a rule with no Next, and one that is not an object.
    // When each is read, each is refused.
    assertStringIncludes(
      refusalForRule({ Variable: "$.term", NumericEquals: 3 }),
      "has no Next",
    );
    assertStringIncludes(refusalForRule("Enrol"), "is not an object");
  });

  it("refuses a rule that tests nothing, or more than one thing", () => {
    // Given a rule with no comparator and one with two.
    // When each is read, each names what it found.
    assertStringIncludes(
      refusalForRule({ Variable: "$.term", Next: "Enrol" }),
      "tests nothing",
    );
    assertStringIncludes(
      refusalForRule({
        Variable: "$.term",
        NumericEquals: 3,
        NumericLessThan: 4,
        Next: "Enrol",
      }),
      "NumericEquals, NumericLessThan",
    );
  });

  it("refuses a comparator Amazon States Language does not define", () => {
    // Given a rule testing with something invented, and one asking for the
    // Path twin StringMatches has not got.
    // When each is read, each is refused by name.
    assertStringIncludes(
      refusalForRule({ Variable: "$.term", NumericAbout: 3, Next: "Enrol" }),
      "NumericAbout",
    );
    assertStringIncludes(
      refusalForRule({
        Variable: "$.key",
        StringMatchesPath: "$.pattern",
        Next: "Enrol",
      }),
      "StringMatchesPath",
    );
  });

  it("refuses a comparison with no Variable to compare", () => {
    // Given a comparator with nothing to read.
    // When it is read, it is refused.
    assertStringIncludes(
      refusalForRule({ NumericEquals: 3, Next: "Enrol" }),
      "has no Variable",
    );
  });

  it("refuses an operand that is not the kind the comparator compares", () => {
    // Given comparators written with the wrong kind of operand.
    // When each is read, each names the kind it takes.
    assertStringIncludes(
      refusalForRule({ Variable: "$.term", NumericEquals: "3", Next: "Enrol" }),
      "NumericEquals takes a number",
    );
    assertStringIncludes(
      refusalForRule({ Variable: "$.term", IsPresent: "yes", Next: "Enrol" }),
      "IsPresent takes a boolean",
    );
    assertStringIncludes(
      refusalForRule({
        Variable: "$.score",
        NumericEqualsPath: 3,
        Next: "Enrol",
      }),
      "NumericEqualsPath takes a string",
    );
  });

  it("refuses a path outside the subset this reads", () => {
    // Given a rule reading a wildcard path.
    // When it is read, the path itself is refused.
    assertStringIncludes(
      refusalForRule({
        Variable: "$.terms[*]",
        IsPresent: true,
        Next: "Enrol",
      }),
      "wildcards",
    );
  });

  it("refuses an And or an Or holding no rules", () => {
    // Given a boolean operator with nothing under it.
    // When each is read, each is refused.
    assertStringIncludes(
      refusalForRule({ And: [], Next: "Enrol" }),
      "non-empty array of rules",
    );
    assertStringIncludes(
      refusalForRule({ Or: "$.term", Next: "Enrol" }),
      "non-empty array of rules",
    );
  });

  it("refuses a nested rule that says where the execution goes", () => {
    // Given a rule inside an And carrying its own Next.
    // When it is read, it is refused rather than ignored.
    assertStringIncludes(
      refusalForRule({
        And: [{ Variable: "$.term", NumericEquals: 3, Next: "Enrol" }],
        Next: "Enrol",
      }),
      "Only the rule at the top",
    );
  });

  it("refuses a boolean operator carrying a Variable of its own", () => {
    // Given an And that names a variable as well as the rules under it.
    // When it is read, it is refused.
    assertStringIncludes(
      refusalForRule({
        Variable: "$.term",
        And: [{ Variable: "$.term", NumericEquals: 3 }],
        Next: "Enrol",
      }),
      "carries a Variable",
    );
  });

  it("refuses a transition naming a state that is not there", () => {
    // Given a rule and a Default pointing at states the machine has not got.
    // When each is read, each is refused when the state machine is created.
    assertStringIncludes(
      refusalForRule({ Variable: "$.term", NumericEquals: 3, Next: "Absent" }),
      "moves to Absent",
    );
    assertStringIncludes(
      refusalFor({
        Choices: [{ Variable: "$.term", NumericEquals: 3, Next: "Enrol" }],
        Default: "Absent",
      }),
      "Default of Absent",
    );
  });

  it("refuses a Default that is not a state name", () => {
    // Given a Default written as something else.
    // When it is read, it is refused.
    assertStringIncludes(
      refusalFor({
        Choices: [{ Variable: "$.term", NumericEquals: 3, Next: "Enrol" }],
        Default: 3,
      }),
      "Default that is not a state name",
    );
  });

  it("refuses a Choice state carrying Next or End of its own", () => {
    // Given a Choice state written as though it moved on like a Pass state.
    // When each is read, each is refused.
    for (const transition of [{ Next: "Enrol" }, { End: true }]) {
      assertStringIncludes(
        refusalFor({
          Choices: [{ Variable: "$.term", NumericEquals: 3, Next: "Enrol" }],
          ...transition,
        }),
        "moves on through its Choices and its Default",
      );
    }
  });

  it("refuses the data-flow fields a Choice state does not have", () => {
    // Given a Choice state carrying a ResultPath.
    // When it is read, it is refused by field name.
    assertStringIncludes(
      refusalFor({
        Choices: [{ Variable: "$.term", NumericEquals: 3, Next: "Enrol" }],
        ResultPath: "$.check",
      }),
      "The Choice state Eligible carries ResultPath",
    );
  });
});
