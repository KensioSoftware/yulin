import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { parseSimStatesReferencePath } from "./sim-states-reference-path.js";

describe("Step Functions Reference Path refusals", () => {
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

  it("refuses a dotted field name holding punctuation", () => {
    // Given names outside the member-name-shorthand rule.
    const refused = ["$.a?b", "$.a-b", "$.a@b"];

    // When each is parsed.
    const errors = refused.map((path) =>
      assertThrowsError(() => parseSimStatesReferencePath(path)),
    );

    // Then each points at bracket notation.
    for (const error of errors) {
      assertStringIncludes(error.message, "written in brackets");
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
    assertStringIncludes(error.message, "written in brackets");
  });

  it("refuses a path with nothing between its separators", () => {
    // Given a path with an empty segment.
    // When it is parsed.
    const error = assertThrowsError(() =>
      parseSimStatesReferencePath("$.enrolment..student"),
    );

    // Then it is refused.
    assertStringIncludes(error.message, "member-name-shorthand");
  });
});
