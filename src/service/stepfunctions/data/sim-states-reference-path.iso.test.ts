import {
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
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

  it("refuses a path that is not rooted at the document", () => {
    // Given a path with no root.
    // When it is parsed.
    const error = assertThrowsError(() =>
      parseSimStatesReferencePath("enrolment.student"),
    );

    // Then it is refused by name.
    assertStringIncludes(error.message, "has to start with $");
  });

  it("refuses the context object by name", () => {
    // Given a path reading the context object.
    // When it is parsed.
    const error = assertThrowsError(() =>
      parseSimStatesReferencePath("$$.Execution.Name"),
    );

    // Then the refusal says what it is.
    assertStringIncludes(error.message, "context object");
  });

  it("refuses the JSONPath grammar Amazon States Language does not use", () => {
    // Given paths using a wildcard, a filter and a slice.
    const refused = ["$.students[*].name", "$.students[?(@.age>3)]", "$[0:2]"];

    // When each is parsed.
    const errors = refused.map((path) =>
      assertThrowsError(() => parseSimStatesReferencePath(path)),
    );

    // Then each is refused rather than read as something else.
    for (const error of errors) {
      assertStringIncludes(error.message, "does not read");
    }
  });

  it("refuses a root followed by something that is not a separator", () => {
    // Given a path running a name straight on from the root.
    // When it is parsed.
    const error = assertThrowsError(() =>
      parseSimStatesReferencePath("$enrolment"),
    );

    // Then it says what it expected.
    assertStringIncludes(error.message, "Expected . or [");
  });

  it("refuses a dotted wildcard", () => {
    // Given a path selecting every field of an object.
    // When it is parsed.
    const error = assertThrowsError(() =>
      parseSimStatesReferencePath("$.students.*"),
    );

    // Then the wildcard is refused.
    assertStringIncludes(error.message, "wildcard");
  });

  it("refuses a path with nothing between its separators", () => {
    // Given a path with an empty segment.
    // When it is parsed.
    const error = assertThrowsError(() =>
      parseSimStatesReferencePath("$.enrolment..student"),
    );

    // Then it is refused.
    assertStringIncludes(error.message, "empty field name");
  });
});
