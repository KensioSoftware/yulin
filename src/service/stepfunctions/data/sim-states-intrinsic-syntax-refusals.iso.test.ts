import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { evaluateSimStatesIntrinsic } from "./sim-states-intrinsic.js";

const enrolment = {
  student: { name: "Wei", terms: [1, 2, 3] },
  payload: '{"eligible":true}',
};

describe("Step Functions intrinsic syntax refusals", () => {
  it("refuses an expression that is not a call at all", () => {
    // Given text with no argument list.
    // When it runs.
    const error = assertThrowsError(() =>
      evaluateSimStatesIntrinsic("States.Format", enrolment),
    );

    // Then it is refused by shape.
    assertStringIncludes(error.message, "States.Name(arguments)");
  });

  it("refuses an unclosed argument list and an unreadable argument", () => {
    // Given a call missing its closing bracket, and one given a bare word.
    // When each runs.
    const unclosed = assertThrowsError(() =>
      evaluateSimStatesIntrinsic("States.Array('one'", enrolment),
    );
    const bare = assertThrowsError(() =>
      evaluateSimStatesIntrinsic("States.Array(one)", enrolment),
    );

    // Then each is refused.
    assertStringIncludes(unclosed.message, "States.Name(arguments)");
    assertStringIncludes(bare.message, "cannot read");
  });

  it("refuses an argument list whose quote never closes", () => {
    // Given a call whose closing bracket falls inside a string.
    // When it runs.
    const error = assertThrowsError(() =>
      evaluateSimStatesIntrinsic("States.Array('one)", enrolment),
    );

    // Then the unclosed quote is refused.
    assertStringIncludes(error.message, "unclosed quote or bracket");
  });

  it("refuses a string argument with trailing text after its quote", () => {
    // Given an argument that stops being a string partway through.
    // When it runs.
    const error = assertThrowsError(() =>
      evaluateSimStatesIntrinsic("States.Array('one'two)", enrolment),
    );

    // Then it is refused as unterminated.
    assertStringIncludes(error.message, "unterminated string");
  });
});
