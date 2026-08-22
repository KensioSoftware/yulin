import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesWaitState } from "../definition/sim-states-state.js";
import { simStatesWaitDue } from "./sim-states-wait-due.js";

describe("Step Functions Wait due instants", () => {
  const now = new Date("2026-07-26T09:00:00.000Z");

  /**
   * The instant a Wait state written this way waits for.
   */
  function dueFor(
    waits: Partial<SimStatesWaitState>,
    input: JSONValue,
  ): string {
    const state: SimStatesWaitState = { Type: "Wait", End: true, ...waits };

    return simStatesWaitDue(state, input, now).toISOString();
  }

  it("waits a number of seconds from the instant it is reached", () => {
    // Given a Wait state carrying Seconds.
    // When its due instant is worked out.
    // Then it is that many seconds on from now.
    assertIdentical(dueFor({ Seconds: 90 }, {}), "2026-07-26T09:01:30.000Z");
  });

  it("waits until the instant a Timestamp names", () => {
    // Given a Wait state carrying a Timestamp in another zone.
    // When its due instant is worked out.
    // Then it is that instant, wherever the definition wrote it from.
    assertIdentical(
      dueFor({ Timestamp: "2026-07-26T12:00:00+02:00" }, {}),
      "2026-07-26T10:00:00.000Z",
    );
  });

  it("reads the seconds to wait out of the state's input", () => {
    // Given a Wait state reading SecondsPath.
    // When its due instant is worked out against an input holding a number.
    // Then it waits for what the input said.
    assertIdentical(
      dueFor({ SecondsPath: "$.retry.after" }, { retry: { after: 30 } }),
      "2026-07-26T09:00:30.000Z",
    );
  });

  it("reads the instant to wait for out of the state's input", () => {
    // Given a Wait state reading TimestampPath.
    // When its due instant is worked out.
    // Then it is the instant the input holds.
    assertIdentical(
      dueFor(
        { TimestampPath: "$.closesAt" },
        { closesAt: "2026-07-26T17:30:00Z" },
      ),
      "2026-07-26T17:30:00.000Z",
    );
  });

  it("fails where the input holds no number of seconds to wait", () => {
    // Given an input holding something else where SecondsPath reads.
    // When the due instant is worked out.
    const failure = assertThrowsError(() =>
      dueFor({ SecondsPath: "$.after" }, { after: "30" }),
    );

    // Then the state fails, naming the path and what was there.
    assertStringIncludes(failure.message, "SecondsPath $.after");
    assertStringIncludes(failure.message, '"30"');
  });

  it("fails where the input holds a wait longer than one Step Functions takes", () => {
    // Given an input holding more seconds than a Wait state can wait for.
    // When the due instant is worked out.
    const failure = assertThrowsError(() =>
      dueFor({ SecondsPath: "$.after" }, { after: 100_000_000 }),
    );

    // Then the state fails, naming the range a wait falls in.
    assertStringIncludes(failure.message, "between 0 and 99999999");
  });

  it("fails where the input holds no instant to wait for", () => {
    // Given an input holding a date rather than a timestamp.
    // When the due instant is worked out.
    const failure = assertThrowsError(() =>
      dueFor({ TimestampPath: "$.closesAt" }, { closesAt: "2026-07-26" }),
    );

    // Then the state fails, naming what an instant has to look like.
    assertStringIncludes(failure.message, "RFC3339");
  });

  it("fails a Wait state carrying nothing to wait for", () => {
    // Given a state the definition parser would have refused, hand-built the
    // way an execution could still reach one.
    // When its due instant is worked out.
    const failure = assertThrowsError(() => dueFor({}, {}));

    // Then it fails rather than waiting for an instant nothing named.
    assertStringIncludes(failure.message, "nothing says how long it waits");
  });
});
