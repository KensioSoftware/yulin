import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { JSONObject } from "../../../util/type-guard/json.js";
import { parseSimStatesDefinition } from "../definition/sim-states-definition-parse.js";

describe("Step Functions Retry and Catch refusals", () => {
  /**
   * Read a definition whose one task carries the fields under test, and answer
   * with why it was refused.
   */
  function refusalFor(fields: JSONObject): string {
    return assertThrowsError(() =>
      parseSimStatesDefinition(
        JSON.stringify({
          StartAt: "Check",
          States: {
            Check: {
              Type: "Task",
              Resource: "arn:aws:states:::lambda:invoke",
              Parameters: { FunctionName: "check-enrolment" },
              End: true,
              ...fields,
            },
            Compensate: { Type: "Succeed" },
          },
        }),
      ),
    ).message;
  }

  it("refuses a Retry that is not an array of retriers", () => {
    // Given a Retry written as one retrier rather than a list of them.
    // When it is read, it says what the field is.
    assertStringIncludes(
      refusalFor({ Retry: { ErrorEquals: ["States.ALL"] } }),
      "is not an array of retriers",
    );
    assertStringIncludes(
      refusalFor({ Retry: ["States.ALL"] }),
      "is not an object",
    );
  });

  it("refuses an entry that says nothing about what it handles", () => {
    // Given retriers and catchers whose ErrorEquals is missing or empty.
    // When each is read, each names the field it needs.
    assertStringIncludes(
      refusalFor({ Retry: [{ IntervalSeconds: 2 }] }),
      "has no ErrorEquals",
    );
    assertStringIncludes(
      refusalFor({ Catch: [{ ErrorEquals: [], Next: "Compensate" }] }),
      "has no ErrorEquals",
    );
  });

  it("refuses States.ALL named alongside another error", () => {
    // Given a retrier naming the wildcard and something the wildcard covers.
    // When it is read, it says why the pair makes no sense.
    assertStringIncludes(
      refusalFor({
        Retry: [{ ErrorEquals: ["States.TaskFailed", "States.ALL"] }],
      }),
      "stands on its own",
    );
  });

  it("refuses States.ALL written ahead of another entry", () => {
    // Given a catcher after one that already matches anything.
    // When it is read, it says the one after it is unreachable.
    assertStringIncludes(
      refusalFor({
        Catch: [
          { ErrorEquals: ["States.ALL"], Next: "Compensate" },
          { ErrorEquals: ["States.Timeout"], Next: "Compensate" },
        ],
      }),
      "could ever be reached",
    );
  });

  it("refuses the retrier field this simulator does not run", () => {
    // Given a retrier asking for jitter.
    // When it is read, it says why the interval has to be predictable.
    assertStringIncludes(
      refusalFor({
        Retry: [{ ErrorEquals: ["States.ALL"], JitterStrategy: "FULL" }],
      }),
      "JitterStrategy",
    );
  });

  it("refuses the numbers of a retrier that are outside what it takes", () => {
    // Given each of the four numbers written as something a wait cannot be.
    // When each is read, each names the field and its range.
    for (const retrier of [
      { IntervalSeconds: 0 },
      { IntervalSeconds: 1.5 },
      { MaxAttempts: -1 },
      { MaxDelaySeconds: "20" },
      { BackoffRate: 0.5 },
    ]) {
      assertStringIncludes(
        refusalFor({ Retry: [{ ErrorEquals: ["States.ALL"], ...retrier }] }),
        "A retrier in the Task state Check has a",
      );
    }
  });

  it("refuses a catcher that says nothing about where a failure goes", () => {
    // Given a catcher with no Next, and one naming a state that is not there.
    // When each is read, each says which it was.
    assertStringIncludes(
      refusalFor({ Catch: [{ ErrorEquals: ["States.ALL"] }] }),
      "has no Next",
    );
    assertStringIncludes(
      refusalFor({
        Catch: [{ ErrorEquals: ["States.ALL"], Next: "Elsewhere" }],
      }),
      "not one of this state machine's states",
    );
  });

  it("refuses a catcher whose ResultPath is not a Reference Path", () => {
    // Given a ResultPath written as something else, and one written as a path
    // this simulator does not read.
    // When each is read, each is refused.
    assertStringIncludes(
      refusalFor({
        Catch: [
          { ErrorEquals: ["States.ALL"], Next: "Compensate", ResultPath: 3 },
        ],
      }),
      "neither a Reference Path nor null",
    );
    assertStringIncludes(
      refusalFor({
        Catch: [
          {
            ErrorEquals: ["States.ALL"],
            Next: "Compensate",
            ResultPath: "$.errors[*]",
          },
        ],
      }),
      "$.errors[*]",
    );
  });

  it("refuses a timeout that is not a whole number of seconds", () => {
    // Given each of the two timeout fields written as something else.
    // When each is read, each names the field and its range.
    assertStringIncludes(
      refusalFor({ TimeoutSeconds: 0 }),
      "has a TimeoutSeconds of 0",
    );
    assertStringIncludes(
      refusalFor({ HeartbeatSeconds: "30" }),
      'has a HeartbeatSeconds of "30"',
    );
  });
});
