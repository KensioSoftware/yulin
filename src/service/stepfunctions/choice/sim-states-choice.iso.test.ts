import {
  assertFalse,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { parseSimStatesChoices } from "./sim-states-choice-parse.js";

describe("Step Functions Choice comparators", () => {
  /**
   * Whether one rule, read the way a definition is read, matches an input.
   */
  function matches(rule: JSONObject, input: JSONValue): boolean {
    const [only] = parseSimStatesChoices("Eligible", {
      Choices: [{ ...rule, Next: "Enrol" }],
    });

    assertNonNullable(only);

    return only.matches(input);
  }

  it("compares strings by equality and by order", () => {
    // Given a student's name in the state's input.
    const input = { student: "Wei" };

    // When rules compare it as a string.
    // Then each answers the way JavaScript orders strings.
    assertTrue(matches({ Variable: "$.student", StringEquals: "Wei" }, input));
    assertFalse(matches({ Variable: "$.student", StringEquals: "Li" }, input));
    assertTrue(
      matches({ Variable: "$.student", StringGreaterThan: "A" }, input),
    );
    assertTrue(matches({ Variable: "$.student", StringLessThan: "Z" }, input));
    assertTrue(
      matches({ Variable: "$.student", StringLessThanEquals: "Wei" }, input),
    );
    assertTrue(
      matches({ Variable: "$.student", StringGreaterThanEquals: "Wei" }, input),
    );
    assertFalse(
      matches({ Variable: "$.term", StringEquals: "3" }, { term: 3 }),
    );
  });

  it("matches a string against a pattern, honouring its escapes", () => {
    // Given a log path and a name holding a literal asterisk.
    // When StringMatches rules are applied to them.
    // Then the wildcard spans anything and an escaped asterisk does not.
    assertTrue(
      matches(
        { Variable: "$.key", StringMatches: "logs/*/2026-*.json" },
        { key: "logs/enrolment/2026-07.json" },
      ),
    );
    assertFalse(
      matches(
        { Variable: "$.key", StringMatches: "logs/*.json" },
        { key: "logs/enrolment.txt" },
      ),
    );
    assertTrue(
      matches(
        { Variable: "$.name", StringMatches: String.raw`Star\*` },
        { name: "Star*" },
      ),
    );
    assertFalse(
      matches(
        { Variable: "$.name", StringMatches: String.raw`Star\*` },
        { name: "Starling" },
      ),
    );
    assertFalse(
      matches({ Variable: "$.term", StringMatches: "3*" }, { term: 3 }),
    );
  });

  it("compares numbers, and answers false for a value of another type", () => {
    // Given a term number and a term written as a string.
    // When numeric rules compare them.
    // Then only the number compares, and the string simply does not match.
    assertTrue(matches({ Variable: "$.term", NumericEquals: 3 }, { term: 3 }));
    assertTrue(
      matches({ Variable: "$.term", NumericGreaterThan: 2 }, { term: 3 }),
    );
    assertFalse(
      matches({ Variable: "$.term", NumericLessThan: 3 }, { term: 3 }),
    );
    assertTrue(
      matches({ Variable: "$.term", NumericLessThanEquals: 3 }, { term: 3 }),
    );
    assertTrue(
      matches({ Variable: "$.term", NumericGreaterThanEquals: 3 }, { term: 3 }),
    );
    assertFalse(
      matches({ Variable: "$.term", NumericEquals: 3 }, { term: "3" }),
    );
  });

  it("compares booleans by identity", () => {
    // Given an eligibility flag.
    // When boolean rules compare it.
    // Then only the same boolean matches, and a truthy string does not.
    assertTrue(
      matches(
        { Variable: "$.eligible", BooleanEquals: true },
        { eligible: true },
      ),
    );
    assertFalse(
      matches(
        { Variable: "$.eligible", BooleanEquals: true },
        { eligible: false },
      ),
    );
    assertFalse(
      matches(
        { Variable: "$.eligible", BooleanEquals: true },
        { eligible: "true" },
      ),
    );
  });

  it("compares timestamps as instants rather than as strings", () => {
    // Given a deadline written in a different zone from the one compared with.
    const input = { closesAt: "2026-07-26T11:00:00+02:00" };

    // When timestamp rules compare it.
    // Then the comparison is on the instant, and a date alone is not one.
    assertTrue(
      matches(
        { Variable: "$.closesAt", TimestampEquals: "2026-07-26T09:00:00Z" },
        input,
      ),
    );
    assertTrue(
      matches(
        { Variable: "$.closesAt", TimestampLessThan: "2026-07-26T10:00:00Z" },
        input,
      ),
    );
    assertTrue(
      matches(
        {
          Variable: "$.closesAt",
          TimestampGreaterThanEquals: "2026-07-26T09:00:00Z",
        },
        input,
      ),
    );
    assertFalse(
      matches(
        {
          Variable: "$.closesAt",
          TimestampGreaterThan: "2026-07-26T09:00:00Z",
        },
        input,
      ),
    );
    assertFalse(
      matches(
        { Variable: "$.closesAt", TimestampEquals: "2026-07-26T09:00:00Z" },
        { closesAt: "2026-07-26" },
      ),
    );
    assertFalse(
      matches(
        { Variable: "$.closesAt", IsTimestamp: true },
        {
          closesAt: "2026-13-45T09:00:00Z",
        },
      ),
    );
  });

  it("compares two places in the same input through a Path comparator", () => {
    // Given a score and the score it has to beat, both on the input.
    const input = { score: 71, pass: 70, grade: "B", wanted: "B" };

    // When Path comparators compare them.
    // Then each reads its operand from the input rather than the definition.
    assertTrue(
      matches({ Variable: "$.score", NumericGreaterThanPath: "$.pass" }, input),
    );
    assertFalse(
      matches({ Variable: "$.score", NumericLessThanPath: "$.pass" }, input),
    );
    assertTrue(
      matches({ Variable: "$.grade", StringEqualsPath: "$.wanted" }, input),
    );
  });

  it("tests what a field holds, and whether it is there at all", () => {
    // Given an input holding a null, a number and a timestamp.
    const input = {
      cancelled: null,
      term: 3,
      student: "Wei",
      closesAt: "2026-07-26T09:00:00Z",
      enrolled: false,
    };

    // When the data-test comparators are applied.
    // Then each answers for what is there, and for what is not.
    assertTrue(matches({ Variable: "$.term", IsPresent: true }, input));
    assertTrue(matches({ Variable: "$.absent", IsPresent: false }, input));
    assertFalse(matches({ Variable: "$.absent", IsPresent: true }, input));
    assertTrue(matches({ Variable: "$.cancelled", IsNull: true }, input));
    assertFalse(matches({ Variable: "$.term", IsNull: true }, input));
    assertTrue(matches({ Variable: "$.enrolled", IsBoolean: true }, input));
    assertTrue(matches({ Variable: "$.term", IsNumeric: true }, input));
    assertTrue(matches({ Variable: "$.student", IsString: true }, input));
    assertTrue(matches({ Variable: "$.closesAt", IsTimestamp: true }, input));
    assertFalse(matches({ Variable: "$.student", IsTimestamp: true }, input));
  });

  it("combines rules with And, Or and Not", () => {
    // Given a student in their third term.
    const input = { student: "Wei", term: 3 };

    // When rules are combined.
    // Then And needs both, Or needs either, and Not inverts.
    assertTrue(
      matches(
        {
          And: [
            { Variable: "$.term", NumericGreaterThanEquals: 2 },
            { Variable: "$.student", StringEquals: "Wei" },
          ],
        },
        input,
      ),
    );
    assertFalse(
      matches(
        {
          And: [
            { Variable: "$.term", NumericGreaterThanEquals: 2 },
            { Variable: "$.student", StringEquals: "Li" },
          ],
        },
        input,
      ),
    );
    assertTrue(
      matches(
        {
          Or: [
            { Variable: "$.student", StringEquals: "Li" },
            { Variable: "$.term", NumericEquals: 3 },
          ],
        },
        input,
      ),
    );
    assertTrue(
      matches({ Not: { Variable: "$.term", NumericEquals: 4 } }, input),
    );
  });

  it("guards a comparison of a field that may be absent, in that order", () => {
    // Given an input with no term on it at all.
    const input = { student: "Wei" };

    // When an And tests IsPresent before comparing the same field.
    const guarded = matches(
      {
        And: [
          { Variable: "$.term", IsPresent: true },
          { Variable: "$.term", NumericEquals: 3 },
        ],
      },
      input,
    );

    // Then the rule answers false, rather than the comparison failing on a
    // field that is not there.
    assertFalse(guarded);
  });

  it("fails the state where the field being compared is not there", () => {
    // Given a comparison of a field the input does not hold.
    // When the rule is tested.
    const failure = assertThrowsError(() =>
      matches({ Variable: "$.term", NumericEquals: 3 }, { student: "Wei" }),
    );

    // Then it fails the way real Step Functions does, naming the path.
    assertStringIncludes(failure.message, "$.term");
    assertStringIncludes(failure.message, "IsPresent");
  });

  it("fails the state where a Path comparator's operand is not there", () => {
    // Given a comparison reading its operand from a path holding nothing.
    // When the rule is tested.
    const failure = assertThrowsError(() =>
      matches(
        { Variable: "$.score", NumericGreaterThanPath: "$.pass" },
        {
          score: 71,
        },
      ),
    );

    // Then the state fails rather than the rule quietly not matching.
    assertStringIncludes(failure.message, "$.pass");
  });
});
