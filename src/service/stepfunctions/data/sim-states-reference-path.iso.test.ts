import {
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { JSONValue } from "../../../util/type-guard/json.js";
import { selectSimStatesPath } from "./sim-states-path-segment.js";
import { parseSimStatesReferencePath } from "./sim-states-reference-path.js";

/**
 * Read a path against a document in one step, the way a state does.
 */
function select(document: JSONValue, path: string): JSONValue | undefined {
  return selectSimStatesPath(document, parseSimStatesReferencePath(path));
}

describe("Step Functions Reference Paths", () => {
  it("selects the whole document for the root", () => {
    // Given a document.
    const document = { student: "Wei", term: 3 };

    // When the root is selected.
    const selected = select(document, "$");

    // Then the document itself comes back.
    assertObjectEquals(selected, document);
  });

  it("selects a field by dot and by bracket alike", () => {
    // Given a nested document.
    const document = { enrolment: { student: { name: "Wei" } } };

    // When the same field is read both ways.
    const dotted = select(document, "$.enrolment.student.name");
    const bracketed = select(document, "$['enrolment']['student']['name']");

    // Then both select it.
    assertIdentical(dotted, "Wei");
    assertIdentical(bracketed, "Wei");
  });

  it("selects an array element by index", () => {
    // Given a document holding an array.
    const document = { students: [{ name: "Wei" }, { name: "Mei" }] };

    // When the second element's field is read.
    const selected = select(document, "$.students[1].name");

    // Then that element answers.
    assertIdentical(selected, "Mei");
  });

  it("reads a field name holding a dot when it is bracketed", () => {
    // Given a document whose field name has a dot in it.
    const document = { "student.name": "Wei" };

    // When the bracketed form reads it.
    const selected = select(document, "$['student.name']");

    // Then the whole name is one segment.
    assertIdentical(selected, "Wei");
  });

  it("reads an escaped quote inside a bracketed field name", () => {
    // Given a field name carrying a quote.
    const document = { "it's": "Wei" };

    // When the escaped form reads it.
    const selected = select(document, String.raw`$['it\'s']`);

    // Then the quote is part of the name.
    assertIdentical(selected, "Wei");
  });

  it("selects nothing where the document holds nothing at the path", () => {
    // Given a document without the field.
    const document = { enrolment: { student: "Wei" } };

    // When a missing field, a missing index and a field of a string are read.
    const missingField = select(document, "$.enrolment.term");
    const missingIndex = select(document, "$.enrolment[3]");
    const throughString = select(document, "$.enrolment.student.name");

    // Then each answers with nothing rather than failing.
    assertUndefined(missingField);
    assertUndefined(missingIndex);
    assertUndefined(throughString);
  });

  it("selects nothing for an index into something that is not an array", () => {
    // Given a document whose field holds an object.
    const document = { enrolment: { student: "Wei" } };

    // When it is read as an array.
    const selected = select(document, "$.enrolment[0]");

    // Then nothing is selected.
    assertUndefined(selected);
  });

  it("reads a bracketed name written after a dot", () => {
    // Given the form the Amazon States Language docs use for a name with a
    // space in it.
    const document = { abc: { "def ghi": "Wei" } };

    // When it is read.
    const selected = select(document, "$.abc.['def ghi']");

    // Then the bracketed name is one segment.
    assertIdentical(selected, "Wei");
  });

  it("selects nothing for a field the document inherits rather than owns", () => {
    // Given a document with no such field of its own.
    const document = { student: "Wei" };

    // When a name every JavaScript object carries is read.
    const selected = select(document, "$.toString");

    // Then nothing is selected.
    assertUndefined(selected);
  });
});
