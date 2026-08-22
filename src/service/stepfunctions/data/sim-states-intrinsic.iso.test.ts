import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
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
});
