import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { evaluateSimStatesIntrinsic } from "./sim-states-intrinsic.js";

const enrolment = {
  student: { name: "Wei", terms: [1, 2, 3] },
  payload: '{"eligible":true}',
};

/**
 * Run an intrinsic that is expected to fail, and answer with why it did.
 */
function refusalFor(expression: string): string {
  return assertThrowsError(() =>
    evaluateSimStatesIntrinsic(expression, enrolment),
  ).message;
}

describe("Step Functions intrinsic function refusals", () => {
  it("refuses an intrinsic this simulator does not answer", () => {
    // Given a call to one left out on purpose.
    // When it runs, the refusal lists what is answered.
    assertStringIncludes(refusalFor("States.UUID()"), "States.Format");
  });

  it("refuses a call whose placeholders and arguments disagree", () => {
    // Given two placeholders and one argument.
    // When it runs, the count is refused.
    assertStringIncludes(
      refusalFor("States.Format('{} {}', 'one')"),
      "placeholders",
    );
  });

  it("refuses a path argument selecting nothing", () => {
    // Given a path the document has no value at.
    // When it runs, the failure names the path.
    assertStringIncludes(
      refusalFor("States.ArrayLength($.absent)"),
      "$.absent",
    );
  });

  it("refuses arguments of the wrong type", () => {
    // Given calls given the wrong shape of value.
    // When each runs, each says what it needed.
    for (const expression of [
      "States.Format($.student.terms)",
      "States.ArrayLength($.student.name)",
      "States.StringToJson($.student.terms)",
    ]) {
      assertStringIncludes(refusalFor(expression), "needs");
    }
  });

  it("refuses a string that is not JSON", () => {
    // Given a value that will not parse.
    // When it is read as JSON, the failure says so.
    assertStringIncludes(
      refusalFor("States.StringToJson($.student.name)"),
      "not JSON",
    );
  });

  it("refuses a single-argument intrinsic given the wrong number", () => {
    // Given calls with no argument and with two.
    // When each runs, each says how many it takes.
    for (const expression of [
      "States.JsonToString()",
      "States.StringToJson()",
      "States.ArrayLength()",
      "States.JsonToString($.student, $.payload)",
      "States.StringToJson($.payload, $.payload)",
      "States.ArrayLength($.student.terms, $.student.terms)",
    ]) {
      assertStringIncludes(refusalFor(expression), "takes one argument");
    }
  });
});
