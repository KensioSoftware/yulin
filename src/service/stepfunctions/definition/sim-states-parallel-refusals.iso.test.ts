import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { JSONObject } from "../../../util/type-guard/json.js";
import { parseSimStatesDefinition } from "./sim-states-definition-parse.js";

describe("Step Functions Parallel state refusals", () => {
  /**
   * Read a definition of one `Parallel` state that is expected to be refused,
   * and answer with why.
   */
  function refusalFor(state: JSONObject): string {
    return assertThrowsError(() =>
      parseSimStatesDefinition(
        JSON.stringify({
          StartAt: "Fan",
          States: { Fan: { Type: "Parallel", ...state } },
        }),
      ),
    ).message;
  }

  /**
   * A branch that runs on its own.
   */
  const enrolling: JSONObject = {
    StartAt: "Enrol",
    States: { Enrol: { Type: "Pass", End: true } },
  };

  it("refuses a Parallel state with no branches to run", () => {
    // Given a Parallel state carrying no Branches, and one carrying none.
    // When each is read, each says a Parallel state needs one.
    assertStringIncludes(
      refusalFor({ End: true }),
      "The Parallel state Fan needs a Branches array holding at least one",
    );
    assertStringIncludes(
      refusalFor({ Branches: [], End: true }),
      "The Parallel state Fan needs a Branches array holding at least one",
    );
  });

  it("refuses a branch that is not a state machine of its own", () => {
    // Given a branch written as something other than an object, and one with
    // no StartAt.
    // When each is read, each names the branch it was.
    assertStringIncludes(
      refusalFor({ Branches: ["Enrol"], End: true }),
      "Branch 1 of the Parallel state Fan is not an object",
    );
    assertStringIncludes(
      refusalFor({
        Branches: [enrolling, { States: { Enrol: { Type: "Succeed" } } }],
        End: true,
      }),
      "Branch 2 of the Parallel state Fan: A state machine definition needs " +
        "a StartAt",
    );
  });

  it("refuses a branch using something this simulator does not run", () => {
    // Given a branch holding a state type still to come.
    const refusal = refusalFor({
      Branches: [
        {
          StartAt: "Enrol",
          States: { Enrol: { Type: "Map", End: true } },
        },
      ],
      End: true,
    });

    // When it is read, the refusal names the branch and keeps what the state
    // itself said.
    assertStringIncludes(refusal, "Branch 1 of the Parallel state Fan:");
    assertStringIncludes(refusal, "is a Map state, which this simulator does");
  });

  it("refuses a branch moving to a state outside itself", () => {
    // Given a branch whose Next names a state in the workflow around it.
    // When it is read, it is refused: a branch reaches its own states only.
    assertStringIncludes(
      refusalFor({
        Branches: [
          {
            StartAt: "Enrol",
            States: { Enrol: { Type: "Pass", Next: "Fan" } },
          },
        ],
        End: true,
      }),
      "Branch 1 of the Parallel state Fan: The state Enrol moves to Fan",
    );
  });

  it("refuses the fields a Parallel state does not have", () => {
    // Given a Parallel state carrying a task's timeout.
    // When it is read, it names the field and the type.
    assertStringIncludes(
      refusalFor({ Branches: [enrolling], TimeoutSeconds: 5, End: true }),
      "The Parallel state Fan carries TimeoutSeconds",
    );
  });

  it("names the Parallel state in what its Retry and Catch are refused for", () => {
    // Given a retrier and a catcher that cannot be read.
    // When each is read, each says which state carries it.
    assertStringIncludes(
      refusalFor({
        Branches: [enrolling],
        Retry: [{ ErrorEquals: ["States.ALL"], MaxAttempts: -1 }],
        End: true,
      }),
      "A retrier in the Parallel state Fan has a MaxAttempts of -1",
    );
    assertStringIncludes(
      refusalFor({
        Branches: [enrolling],
        Catch: [{ ErrorEquals: ["States.ALL"], Next: "Compensate" }],
        End: true,
      }),
      "A catcher in the Parallel state Fan moves to Compensate",
    );
  });
});
