import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionFactory } from "../../../test/stepfunctions/states-execution.factory.js";
import { statesFlakyHandlerFactory } from "../../../test/stepfunctions/states-flaky-handler.factory.js";
import { statesTaskFunctionFactory } from "../../../test/stepfunctions/states-task-function.factory.js";
import type { JSONObject } from "../../util/type-guard/json.js";
import { SimAws } from "../aws/sim-aws.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";

describe("Simulated Step Functions Map iterations", () => {
  const startedAt = new Date("2026-07-26T09:00:00.000Z");

  /**
   * Three students to run a Map state over.
   */
  const students = '{"students":[{"id":"wei"},{"id":"mei"},{"id":"jun"}]}';

  /**
   * A simulation whose clock stands still where the test put it.
   */
  function givenAFrozenClock(): SimAws {
    return new SimAws({ clock: new SimFixedClock(startedAt) });
  }

  /**
   * Run a workflow whose first state is the `Map` state under test.
   */
  async function runWorkflow(
    simAws: SimAws,
    state: JSONObject,
    states: JSONObject = {},
  ): Promise<string> {
    return await statesExecutionFactory.make(
      { state, states, input: students },
      simAws,
    );
  }

  /**
   * An item processor that waits a minute and then records the clock.
   */
  function stamping(functionArn: string): JSONObject {
    return {
      StartAt: "Settle",
      States: {
        Settle: { Type: "Wait", Seconds: 60, Next: "Stamp" },
        Stamp: { Type: "Task", Resource: functionArn, End: true },
      },
    };
  }

  /**
   * A function answering with the instant the simulation was at when it ran.
   */
  async function givenAStampingFunction(simAws: SimAws): Promise<string> {
    const stamp = await statesTaskFunctionFactory.make(
      {
        functionName: "stamp-enrolment",
        handler: (): unknown => ({ at: new Date().toISOString() }),
      },
      simAws,
    );

    return stamp.arn;
  }

  it("runs the iterations one at a time under a MaxConcurrency of 1", async () => {
    // Given a Map state bounded to one iteration at a time, whose processor
    // waits a minute before it records the clock.
    const simAws = givenAFrozenClock();
    const executionArn = await runWorkflow(simAws, {
      Type: "Map",
      ItemsPath: "$.students",
      MaxConcurrency: 1,
      ItemProcessor: stamping(await givenAStampingFunction(simAws)),
      End: true,
    });

    // When simulated time passes all three waits.
    await simAws.clock().advanceBy({ minutes: 5 });

    // Then each iteration waited its own minute, which it could only have
    // done by starting after the one before it finished.
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertIdentical(described.status, "SUCCEEDED");
    assertObjectEquals(JSON.parse(described.output ?? "null") as unknown, [
      { at: "2026-07-26T09:01:00.000Z" },
      { at: "2026-07-26T09:02:00.000Z" },
      { at: "2026-07-26T09:03:00.000Z" },
    ]);
  });

  it("runs every iteration at once where nothing bounds them", async () => {
    // Given the same workflow with a MaxConcurrency of 0, which is what a
    // Map state carrying none means.
    const simAws = givenAFrozenClock();
    const executionArn = await runWorkflow(simAws, {
      Type: "Map",
      ItemsPath: "$.students",
      MaxConcurrency: 0,
      ItemProcessor: stamping(await givenAStampingFunction(simAws)),
      End: true,
    });

    // When simulated time passes the one wait they share.
    await simAws.clock().advanceBy({ minutes: 5 });

    // Then all three ran their task at the same instant.
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertObjectEquals(JSON.parse(described.output ?? "null") as unknown, [
      { at: "2026-07-26T09:01:00.000Z" },
      { at: "2026-07-26T09:01:00.000Z" },
      { at: "2026-07-26T09:01:00.000Z" },
    ]);
  });

  it("fails the state when an iteration fails, and catches it", async () => {
    // Given a Map state whose processor declines the second student, and a
    // Catch that compensates for the state failing.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(
      simAws,
      {
        Type: "Map",
        ItemsPath: "$.students",
        ItemProcessor: {
          StartAt: "Eligible",
          States: {
            Eligible: {
              Type: "Choice",
              Choices: [
                { Variable: "$.id", StringEquals: "mei", Next: "Decline" },
              ],
              Default: "Register",
            },
            Register: { Type: "Pass", End: true },
            Decline: { Type: "Fail", Error: "NotEligible", Cause: "no place" },
          },
        },
        Catch: [
          {
            ErrorEquals: ["States.BranchFailed"],
            Next: "Compensate",
            ResultPath: "$.error",
          },
        ],
        End: true,
      },
      { Compensate: { Type: "Pass", End: true } },
    );

    // When it runs, the catcher took the failure and the cause names the
    // iteration that failed.
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertIdentical(described.status, "SUCCEEDED");
    assertObjectEquals(
      (JSON.parse(described.output ?? "null") as { error: unknown }).error,
      {
        Error: "States.BranchFailed",
        Cause:
          "Iteration 1 of the Map state Check failed with NotEligible: no place",
      },
    );
    // The third student was never reached: an iteration failing leaves the
    // ones that have not started nothing to do.
    assertObjectEquals(
      simAws
        .stepFunctions()
        .inspection()
        .iterations(executionArn)
        .map((iteration) => iteration.status),
      ["SUCCEEDED", "FAILED"],
    );
  });

  it("runs the iterations again for a Retry on the Map state", async () => {
    // Given a Map state whose task fails the first time it is called.
    const simAws = new SimAws();
    const enrol = await statesTaskFunctionFactory.make(
      {
        functionName: "enrol-student",
        handler: statesFlakyHandlerFactory.make({ failures: 1 }),
      },
      simAws,
    );
    const executionArn = await runWorkflow(simAws, {
      Type: "Map",
      ItemsPath: "$.students",
      MaxConcurrency: 1,
      ItemProcessor: {
        StartAt: "Enrol",
        States: { Enrol: { Type: "Task", Resource: enrol.arn, End: true } },
      },
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

    // Then every iteration ran again, and the second run came good.
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.output,
      '[{"eligible":true},{"eligible":true},{"eligible":true}]',
    );
    assertObjectEquals(
      simAws
        .stepFunctions()
        .inspection()
        .iterations(executionArn)
        .map((iteration) => `${String(iteration.index)} ${iteration.status}`),
      ["0 FAILED", "0 SUCCEEDED", "1 SUCCEEDED", "2 SUCCEEDED"],
    );
  });
});
