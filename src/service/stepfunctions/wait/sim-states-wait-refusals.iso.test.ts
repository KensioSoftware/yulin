import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import type { JSONObject } from "../../../util/type-guard/json.js";
import { parseSimStatesDefinition } from "../definition/sim-states-definition-parse.js";

describe("Step Functions Wait refusals", () => {
  /**
   * Read a definition whose Wait state is expected to be refused, and answer
   * with why.
   */
  function refusalFor(wait: JSONObject): string {
    return assertThrowsError(() =>
      parseSimStatesDefinition(
        JSON.stringify({
          StartAt: "Hold",
          States: { Hold: { Type: "Wait", End: true, ...wait } },
        }),
      ),
    ).message;
  }

  it("refuses a Wait state that does not say how long to wait", () => {
    // Given a Wait state carrying none of the four fields.
    // When it is read, it names them.
    assertStringIncludes(
      refusalFor({}),
      "carries none of Seconds, SecondsPath, Timestamp, TimestampPath",
    );
  });

  it("refuses a Wait state carrying more than one of them", () => {
    // Given a Wait state carrying both a duration and an instant.
    // When it is read, it names what it found.
    assertStringIncludes(
      refusalFor({ Seconds: 30, Timestamp: "2026-07-26T09:00:00Z" }),
      "carries Seconds, Timestamp",
    );
  });

  it("refuses a Seconds that is not a whole number of seconds", () => {
    // Given a Seconds written as a string, and one written as a fraction.
    // When each is read, each is refused.
    assertStringIncludes(refusalFor({ Seconds: "30" }), "not a whole number");
    assertStringIncludes(refusalFor({ Seconds: 1.5 }), "not a whole number");
  });

  it("refuses a wait that runs backwards", () => {
    // Given a negative Seconds.
    // When it is read, it is refused.
    assertStringIncludes(
      refusalFor({ Seconds: -30 }),
      "A wait does not run backwards",
    );
  });

  it("refuses a Timestamp that is not an instant", () => {
    // Given a Timestamp written as a date, with no time or zone on it.
    // When it is read, it is refused with an example of one that works.
    assertStringIncludes(
      refusalFor({ Timestamp: "2026-07-26" }),
      "2026-07-26T09:00:00Z",
    );
  });

  it("refuses a wait path that is not a Reference Path", () => {
    // Given a SecondsPath written as a number, and a TimestampPath using a
    // wildcard.
    // When each is read, each is refused.
    assertStringIncludes(
      refusalFor({ SecondsPath: 30 }),
      "has a SecondsPath that is not a Reference Path",
    );
    assertStringIncludes(
      refusalFor({ TimestampPath: "$.closesAt[*]" }),
      "wildcards",
    );
  });

  it("refuses the data-flow fields a Wait state does not have", () => {
    // Given a Wait state carrying a ResultSelector.
    // When it is read, it is refused by field name.
    assertStringIncludes(
      refusalFor({ Seconds: 30, ResultSelector: { held: true } }),
      "The Wait state Hold carries ResultSelector",
    );
  });
});
