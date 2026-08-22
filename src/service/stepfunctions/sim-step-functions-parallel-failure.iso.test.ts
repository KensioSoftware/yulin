import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionFactory } from "../../../test/stepfunctions/states-execution.factory.js";
import { statesFlakyHandlerFactory } from "../../../test/stepfunctions/states-flaky-handler.factory.js";
import { statesTaskFunctionFactory } from "../../../test/stepfunctions/states-task-function.factory.js";
import type { JSONObject } from "../../util/type-guard/json.js";
import { SimAws } from "../aws/sim-aws.js";
import type { SimDescribeExecutionCommandOutput } from "./command/execution/execution.command.js";

describe("Simulated Step Functions Parallel failures", () => {
  /**
   * A branch that fails as soon as it is reached.
   */
  const declining: JSONObject = {
    StartAt: "Decline",
    States: {
      Decline: {
        Type: "Fail",
        Error: "NotEligible",
        Cause: "no place left on the course",
      },
    },
  };

  /**
   * A branch that waits, so a sibling can fail while it is still going.
   */
  const settling: JSONObject = {
    StartAt: "Settle",
    States: {
      Settle: { Type: "Wait", Seconds: 300, Next: "Enrol" },
      Enrol: { Type: "Pass", End: true },
    },
  };

  /**
   * The states a caught failure can be sent to.
   */
  const compensating: JSONObject = {
    Compensate: { Type: "Pass", End: true },
  };

  /**
   * Run a workflow whose first state is the `Parallel` state under test, and
   * read back how the execution ended.
   */
  async function runWorkflow(
    simAws: SimAws,
    state: JSONObject,
    states: JSONObject = {},
  ): Promise<{
    readonly described: SimDescribeExecutionCommandOutput;
    readonly executionArn: string;
  }> {
    const executionArn = await statesExecutionFactory.make(
      { state, states },
      simAws,
    );

    return {
      described: await simAws
        .stepFunctions()
        .describeExecution({ input: { executionArn } }),
      executionArn,
    };
  }

  it("fails the state with States.BranchFailed, naming the branch", async () => {
    // Given a Parallel state whose second branch fails.
    const simAws = new SimAws();

    // When it runs.
    const { described } = await runWorkflow(simAws, {
      Type: "Parallel",
      Branches: [
        { StartAt: "Enrol", States: { Enrol: { Type: "Pass", End: true } } },
        declining,
      ],
      End: true,
    });

    // Then the state failed under the name Amazon States Language gives a
    // branch failure, and the cause says which branch and what it failed
    // with.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.BranchFailed");
    assertIdentical(
      described.cause,
      "Branch 2 of the Parallel state Check failed with NotEligible: no " +
        "place left on the course",
    );
  });

  it("abandons the branches still going when one of them fails", async () => {
    // Given a Parallel state whose first branch is waiting on the clock when
    // its sibling fails.
    const simAws = new SimAws();
    const { described, executionArn } = await runWorkflow(simAws, {
      Type: "Parallel",
      Branches: [settling, declining],
      End: true,
    });

    // When the clock passes what the waiting branch was waiting for.
    await simAws.clock().advanceBy({ minutes: 10 });

    // Then it never went on to the state after the wait, and reads as
    // abandoned rather than as failed.
    assertIdentical(described.status, "FAILED");
    assertObjectEquals(
      simAws
        .stepFunctions()
        .inspection()
        .branches(executionArn)
        .map((branch) => ({
          status: branch.status,
          visited: branch.visitedStates,
        })),
      [
        { status: "ABANDONED", visited: ["Settle"] },
        { status: "FAILED", visited: ["Decline"] },
      ],
    );
    assertObjectEquals(
      simAws
        .stepFunctions()
        .inspection()
        .branches(executionArn)
        .map((branch) => branch.error),
      [undefined, "NotEligible"],
    );
  });

  it("gives up on a Parallel state inside an abandoned branch", async () => {
    // Given a branch that fans out again and is waiting on the clock, beside
    // one that fails.
    const simAws = new SimAws();
    const { executionArn } = await runWorkflow(simAws, {
      Type: "Parallel",
      Branches: [
        {
          StartAt: "Split",
          States: {
            Split: {
              Type: "Parallel",
              Branches: [settling],
              End: true,
            },
          },
        },
        declining,
      ],
      End: true,
    });

    // When the clock passes what the nested branch was waiting for.
    await simAws.clock().advanceBy({ minutes: 10 });

    // Then the branch holding it was abandoned, and never went on to the
    // state after its own Parallel.
    assertObjectEquals(
      simAws
        .stepFunctions()
        .inspection()
        .branches(executionArn)
        .map((branch) => `${branch.stateName} ${branch.status}`),
      ["Check ABANDONED", "Split ABANDONED", "Check FAILED"],
    );
  });

  it("sends a branch failure to a Catch on the Parallel state", async () => {
    // Given a Parallel state that compensates for a branch failing.
    const simAws = new SimAws();

    // When a branch fails.
    const { described, executionArn } = await runWorkflow(
      simAws,
      {
        Type: "Parallel",
        Branches: [declining],
        Catch: [
          {
            ErrorEquals: ["States.BranchFailed"],
            Next: "Compensate",
            ResultPath: "$.error",
          },
        ],
        End: true,
      },
      compensating,
    );

    // Then the execution went on to the compensating state, carrying the
    // error beside the input the Parallel state was given.
    assertIdentical(described.status, "SUCCEEDED");
    assertObjectEquals(JSON.parse(described.output ?? "null") as unknown, {
      student: "Wei",
      error: {
        Error: "States.BranchFailed",
        Cause:
          "Branch 1 of the Parallel state Check failed with NotEligible: no " +
          "place left on the course",
      },
    });
    assertObjectEquals(
      simAws.stepFunctions().inspection().visitedStates(executionArn),
      ["Check", "Compensate"],
    );
  });

  it("runs the branches again for a Retry on the Parallel state", async () => {
    // Given a Parallel state whose branch invokes a function that fails once.
    const simAws = new SimAws();
    const check = await statesTaskFunctionFactory.make(
      { handler: statesFlakyHandlerFactory.make({ failures: 1 }) },
      simAws,
    );
    const { executionArn } = await runWorkflow(simAws, {
      Type: "Parallel",
      Branches: [
        {
          StartAt: "Enrol",
          States: {
            Enrol: { Type: "Task", Resource: check.arn, End: true },
          },
        },
      ],
      Retry: [
        {
          ErrorEquals: ["States.BranchFailed"],
          IntervalSeconds: 5,
          MaxAttempts: 1,
        },
      ],
      End: true,
    });

    // When the clock passes the wait before the retry.
    await simAws.clock().advanceBy({ seconds: 10 });

    // Then the branches ran a second time, and the second run came good.
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '[{"eligible":true}]');
    assertObjectEquals(
      simAws
        .stepFunctions()
        .inspection()
        .branches(executionArn)
        .map((branch) => branch.status),
      ["FAILED", "SUCCEEDED"],
    );

    // The states inside the branches are counted among the execution's
    // attempts, so the task inside them shows both of its runs.
    assertObjectEquals(
      simAws
        .stepFunctions()
        .inspection()
        .attempts(executionArn)
        .map((attempt) => attempt.stateName),
      ["Enrol", "Check", "Enrol", "Check"],
    );
  });

  it("leaves a branch that failed on its data as States.Runtime", async () => {
    // Given a Parallel state that catches anything, and a branch whose Choice
    // rule reads a field that is not there.
    const simAws = new SimAws();

    // When it runs.
    const { described } = await runWorkflow(
      simAws,
      {
        Type: "Parallel",
        Branches: [
          {
            StartAt: "Eligible",
            States: {
              Eligible: {
                Type: "Choice",
                Choices: [
                  { Variable: "$.term", NumericEquals: 3, Next: "Enrol" },
                ],
                Default: "Enrol",
              },
              Enrol: { Type: "Pass", End: true },
            },
          },
        ],
        Catch: [{ ErrorEquals: ["States.ALL"], Next: "Compensate" }],
        End: true,
      },
      compensating,
    );

    // Then the failure kept the name nothing catches, and the catcher did not
    // take it.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.Runtime");
  });

  it("reports a branch that failed without saying why", async () => {
    // Given a branch reaching a Fail state that carries no Cause.
    const simAws = new SimAws();

    // When it runs.
    const { described, executionArn } = await runWorkflow(simAws, {
      Type: "Parallel",
      Branches: [
        {
          StartAt: "Decline",
          States: { Decline: { Type: "Fail", Error: "NotEligible" } },
        },
      ],
      End: true,
    });

    // Then the cause says which branch failed and what it failed with, and
    // nothing more.
    assertIdentical(
      described.cause,
      "Branch 1 of the Parallel state Check failed with NotEligible",
    );
    assertArrayLength(
      simAws.stepFunctions().inspection().branches(executionArn),
      1,
    );
  });
});
