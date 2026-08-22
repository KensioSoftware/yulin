import {
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesFlakyHandlerFactory } from "../../../test/stepfunctions/states-flaky-handler.factory.js";
import { statesExecutionFactory } from "../../../test/stepfunctions/states-execution.factory.js";
import { statesTaskFunctionFactory } from "../../../test/stepfunctions/states-task-function.factory.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";
import type { JSONObject } from "../../util/type-guard/json.js";
import { SimAws } from "../aws/sim-aws.js";
import type { SimDescribeExecutionCommandOutput } from "./command/execution/execution.command.js";

describe("How long a Task state waits", () => {
  const startedAt = "2026-07-26T09:00:00.000Z";

  /**
   * A simulation whose clock stands still, holding a function that raises a
   * number of times before it answers.
   */
  async function givenAFlakyFunction(failures: number): Promise<SimAws> {
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date(startedAt)),
    });

    await statesTaskFunctionFactory.make(
      { handler: statesFlakyHandlerFactory.make({ failures }) },
      simAws,
    );

    return simAws;
  }

  /**
   * Run a workflow of one task, then move the clock well past everything the
   * task could be waiting for.
   */
  async function runPastTheDeadline(
    failures: number,
    state: JSONObject,
  ): Promise<SimDescribeExecutionCommandOutput> {
    const simAws = await givenAFlakyFunction(failures);
    const executionArn = await statesExecutionFactory.make({ state }, simAws);

    await simAws.clock().advanceBy({ minutes: 5 });

    return await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });
  }

  /**
   * The task the tests below run, retried often enough to outlast a deadline.
   */
  function invokeCheck(waiting: JSONObject): JSONObject {
    return {
      Type: "Task",
      Resource: "arn:aws:states:::lambda:invoke",
      Parameters: { FunctionName: "check-enrolment", "Payload.$": "$" },
      Retry: [
        { ErrorEquals: ["States.ALL"], IntervalSeconds: 10, BackoffRate: 1 },
      ],
      ...waiting,
      End: true,
    };
  }

  it("gives up on a task that has run past its TimeoutSeconds", async () => {
    // Given a task retried every ten seconds, allowed fifteen in all.
    // When the clock passes that.
    const described = await runPastTheDeadline(
      10,
      invokeCheck({
        TimeoutSeconds: 15,
      }),
    );

    // Then the task gave up at the instant it said it would, rather than at
    // the attempt due after it.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.Timeout");
    assertIdentical(
      described.stopDate?.toISOString(),
      "2026-07-26T09:00:15.000Z",
    );
    assertStringIncludes(described.cause ?? "", "TimeoutSeconds");
  });

  it("gives up on a task nothing has sent a heartbeat for", async () => {
    // Given a task carrying both fields, the heartbeat being the shorter.
    // When the clock passes that.
    const described = await runPastTheDeadline(
      10,
      invokeCheck({
        TimeoutSeconds: 60,
        HeartbeatSeconds: 25,
      }),
    );

    // Then it gave up at whichever of the two came first, and says which.
    assertIdentical(described.error, "States.Timeout");
    assertIdentical(
      described.stopDate?.toISOString(),
      "2026-07-26T09:00:25.000Z",
    );
    assertStringIncludes(described.cause ?? "", "HeartbeatSeconds");
  });

  it("sends a timed out task to its Catch", async () => {
    // Given a task that compensates for running long.
    const simAws = await givenAFlakyFunction(10);
    const executionArn = await statesExecutionFactory.make(
      {
        state: {
          ...invokeCheck({ TimeoutSeconds: 15 }),
          Catch: [
            {
              ErrorEquals: ["States.Timeout"],
              Next: "Compensate",
              ResultPath: "$.error",
            },
          ],
        },
        states: { Compensate: { Type: "Pass", End: true } },
      },
      simAws,
    );

    // When the clock passes the deadline.
    await simAws.clock().advanceBy({ minutes: 5 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then the catcher took it, and the retrier did not start the task again
    // after the attempt that found the deadline behind it.
    assertIdentical(described.status, "SUCCEEDED");
    assertStringIncludes(described.output ?? "", '"Error":"States.Timeout"');
    assertObjectEquals(
      simAws.stepFunctions().inspection().attempts(executionArn),
      [
        { stateName: "Check", error: "States.TaskFailed" },
        { stateName: "Check", error: "States.TaskFailed" },
        { stateName: "Check", error: "States.Timeout" },
        { stateName: "Compensate" },
      ],
    );
  });

  it("leaves a task that answers inside its deadline alone", async () => {
    // Given a task that fails once and answers on the retry, well inside the
    // minute it is allowed.
    // When the clock passes that retry.
    const described = await runPastTheDeadline(
      1,
      invokeCheck({
        TimeoutSeconds: 60,
      }),
    );

    // Then the deadline had nothing to do with how the task ended.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.stopDate?.toISOString(),
      "2026-07-26T09:00:10.000Z",
    );
  });
});
