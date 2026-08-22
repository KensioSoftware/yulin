import {
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { evaluateSimStatesIntrinsic } from "./sim-states-intrinsic.js";

const enrolment = {
  student: { name: "Wei", terms: [1, 2, 3] },
  payload: '{"eligible":true}',
};

describe("Step Functions intrinsic functions", () => {
  it("fills States.Format placeholders from its arguments in order", () => {
    // Given a document naming a student.
    // When a message is formatted from a literal and a path.
    const formatted = evaluateSimStatesIntrinsic(
      "States.Format('Enrolled {} for term {}', $.student.name, 3)",
      enrolment,
    );

    // Then each placeholder took the argument in its position.
    assertIdentical(formatted, "Enrolled Wei for term 3");
  });

  it("writes a non-string States.Format argument as JSON", () => {
    // Given a document holding an array.
    // When it fills a placeholder.
    const formatted = evaluateSimStatesIntrinsic(
      "States.Format('Terms {}', $.student.terms)",
      enrolment,
    );

    // Then it arrives as JSON rather than as a comma-joined string.
    assertIdentical(formatted, "Terms [1,2,3]");
  });

  it("leaves an escaped placeholder alone", () => {
    // Given a template escaping its braces.
    // When it is formatted.
    const formatted = evaluateSimStatesIntrinsic(
      String.raw`States.Format('\{} is {}', $.student.name)`,
      enrolment,
    );

    // Then the escaped braces are literal and the plain one is filled.
    assertIdentical(formatted, "{} is Wei");
  });

  it("builds an array with States.Array", () => {
    // Given literals and a path.
    // When an array is built.
    const built = evaluateSimStatesIntrinsic(
      "States.Array($.student.name, 'Mei', true, null)",
      enrolment,
    );

    // Then each argument is an element, in order.
    assertObjectEquals(built, ["Wei", "Mei", true, null]);
  });

  it("counts an array with States.ArrayLength", () => {
    // Given a document holding an array.
    // When its length is taken.
    const length = evaluateSimStatesIntrinsic(
      "States.ArrayLength($.student.terms)",
      enrolment,
    );

    // Then the count comes back.
    assertIdentical(length, 3);
  });

  it("moves between JSON and strings both ways", () => {
    // Given a document holding JSON as a string.
    // When it is parsed and then written back.
    const parsed = evaluateSimStatesIntrinsic(
      "States.StringToJson($.payload)",
      enrolment,
    );
    const written = evaluateSimStatesIntrinsic(
      "States.JsonToString($.student.terms)",
      enrolment,
    );

    // Then each answers in the other form.
    assertObjectEquals(parsed, { eligible: true });
    assertIdentical(written, "[1,2,3]");
  });

  it("runs an intrinsic nested inside another", () => {
    // Given a call whose argument is itself a call.
    // When it runs.
    const formatted = evaluateSimStatesIntrinsic(
      "States.Format('{} terms', States.ArrayLength($.student.terms))",
      enrolment,
    );

    // Then the inner call answered first.
    assertIdentical(formatted, "3 terms");
  });

  it("keeps a comma inside a quoted argument", () => {
    // Given a template holding a comma.
    // When it is formatted.
    const formatted = evaluateSimStatesIntrinsic(
      "States.Format('Wei, Mei and {}', 'Lan')",
      enrolment,
    );

    // Then the comma stayed inside the one argument.
    assertIdentical(formatted, "Wei, Mei and Lan");
  });

  it("reads an escaped quote inside a string argument", () => {
    // Given an argument carrying a quote.
    // When it is formatted.
    const formatted = evaluateSimStatesIntrinsic(
      String.raw`States.Format('it\'s {}', $.student.name)`,
      enrolment,
    );

    // Then the quote is part of the string.
    assertIdentical(formatted, "it's Wei");
  });

  it("refuses an intrinsic this simulator does not answer", () => {
    // Given a call to one that is left out on purpose.
    // When it runs.
    const error = assertThrowsError(() =>
      evaluateSimStatesIntrinsic("States.UUID()", enrolment),
    );

    // Then the refusal lists what is answered.
    assertStringIncludes(error.message, "States.Format");
  });

  it("refuses a call whose placeholders and arguments disagree", () => {
    // Given two placeholders and one argument.
    // When it runs.
    const error = assertThrowsError(() =>
      evaluateSimStatesIntrinsic("States.Format('{} {}', 'one')", enrolment),
    );

    // Then the count is refused.
    assertStringIncludes(error.message, "placeholders");
  });

  it("refuses a path argument selecting nothing", () => {
    // Given a path the document has no value at.
    // When it runs.
    const error = assertThrowsError(() =>
      evaluateSimStatesIntrinsic("States.ArrayLength($.absent)", enrolment),
    );

    // Then the failure names the path.
    assertStringIncludes(error.message, "$.absent");
  });

  it("refuses arguments of the wrong type", () => {
    // Given calls given the wrong shape of value.
    const refused = [
      "States.Format($.student.terms)",
      "States.ArrayLength($.student.name)",
      "States.StringToJson($.student.terms)",
    ];

    // When each runs.
    const errors = refused.map((expression) =>
      assertThrowsError(() =>
        evaluateSimStatesIntrinsic(expression, enrolment),
      ),
    );

    // Then each says what it needed.
    for (const error of errors) {
      assertStringIncludes(error.message, "needs");
    }
  });

  it("refuses a string that is not JSON", () => {
    // Given a document holding something that will not parse.
    // When it is read as JSON.
    const error = assertThrowsError(() =>
      evaluateSimStatesIntrinsic("States.StringToJson($.student.name)", {
        student: { name: "Wei" },
      }),
    );

    // Then the failure says so.
    assertStringIncludes(error.message, "not JSON");
  });

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

  it("builds an empty array from a call with no arguments", () => {
    // Given a call with an empty argument list.
    // When it runs.
    const built = evaluateSimStatesIntrinsic("States.Array()", enrolment);

    // Then it answers with an empty array.
    assertObjectEquals(built, []);
  });

  it("reads false as a literal argument", () => {
    // Given a call given each bare literal.
    // When it runs.
    const built = evaluateSimStatesIntrinsic(
      "States.Array(false, true, null, -2.5)",
      enrolment,
    );

    // Then each arrives as the value it names.
    assertObjectEquals(built, [false, true, null, -2.5]);
  });

  it("writes null for a States.JsonToString call given no argument", () => {
    // Given a call with nothing to write.
    // When it runs.
    const written = evaluateSimStatesIntrinsic(
      "States.JsonToString()",
      enrolment,
    );

    // Then it answers with the JSON null.
    assertIdentical(written, "null");
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
