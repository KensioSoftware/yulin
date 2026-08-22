import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesFlakyHandlerFactory } from "../../../test/stepfunctions/states-flaky-handler.factory.js";
import { statesTaskExecutionFactory } from "../../../test/stepfunctions/states-task-execution.factory.js";
import { statesTaskFunctionFactory } from "../../../test/stepfunctions/states-task-function.factory.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";
import type { JSONObject } from "../../util/type-guard/json.js";
import { SimAws } from "../aws/sim-aws.js";

describe("Simulated Step Functions Retry on the clock", () => {
  /**
   * A simulation whose clock stands still, holding a function that raises a
   * number of times before it answers.
   */
  async function givenAFlakyFunction(failures: number): Promise<SimAws> {
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
    });

    await statesTaskFunctionFactory.make(
      { handler: statesFlakyHandlerFactory.make({ failures }) },
      simAws,
    );

    return simAws;
  }

  /**
   * The task the tests below run, which invokes the flaky function.
   */
  function invokeCheck(retry: JSONObject[]): JSONObject {
    return {
      Type: "Task",
      Resource: "arn:aws:states:::lambda:invoke",
      Parameters: { FunctionName: "check-enrolment", "Payload.$": "$" },
      Retry: retry,
      End: true,
    };
  }

  it("runs a task again until it answers, and records every attempt", async () => {
    // Given a function that raises twice and then answers.
    const simAws = await givenAFlakyFunction(2);
    const executionArn = await statesTaskExecutionFactory.make(
      {
        task: invokeCheck([
          { ErrorEquals: ["States.TaskFailed"], IntervalSeconds: 2 },
        ]),
      },
      simAws,
    );

    // When one advance covers the whole backoff.
    await simAws.clock().advanceBy({ seconds: 10 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then the execution succeeded on the third attempt, which ran six
    // seconds in: two for the first retry and four for the second.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.stopDate?.toISOString(),
      "2026-07-26T09:00:06.000Z",
    );
    assertObjectEquals(
      simAws.stepFunctions().inspection().attempts(executionArn),
      [
        { stateName: "Check", error: "States.TaskFailed" },
        { stateName: "Check", error: "States.TaskFailed" },
        { stateName: "Check" },
      ],
    );
  });

  it("retries on the defaults where a retrier names only the error", async () => {
    // Given a retrier written as Amazon States Language allows the shortest
    // one to be, which waits a second and doubles from there.
    const simAws = await givenAFlakyFunction(2);
    const executionArn = await statesTaskExecutionFactory.make(
      { task: invokeCheck([{ ErrorEquals: ["States.TaskFailed"] }]) },
      simAws,
    );

    // When the clock passes both waits.
    await simAws.clock().advanceBy({ seconds: 10 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then the third attempt ran three seconds in: one for the first retry
    // and two for the second.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.stopDate?.toISOString(),
      "2026-07-26T09:00:03.000Z",
    );
  });

  it("leaves the execution RUNNING between one attempt and the next", async () => {
    // Given a workflow whose second retry falls six seconds in.
    const simAws = await givenAFlakyFunction(2);
    const executionArn = await statesTaskExecutionFactory.make(
      {
        task: invokeCheck([
          { ErrorEquals: ["States.TaskFailed"], IntervalSeconds: 2 },
        ]),
      },
      simAws,
    );

    // When the clock stops partway through the backoff.
    await simAws.clock().advanceBy({ seconds: 3 });

    const between = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then the execution is waiting for the attempt it has not reached, in a
    // state it entered once.
    assertIdentical(between.status, "RUNNING");
    assertArrayLength(
      simAws.stepFunctions().inspection().attempts(executionArn),
      2,
    );
    assertObjectEquals(
      simAws.stepFunctions().inspection().visitedStates(executionArn),
      ["Check"],
    );

    // And the rest of the backoff finishes it.
    await simAws.clock().advanceBy({ seconds: 5 });

    const settled = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertIdentical(settled.status, "SUCCEEDED");
  });

  it("caps the wait between attempts at MaxDelaySeconds", async () => {
    // Given a retrier whose backoff would reach a hundred seconds untouched.
    const simAws = await givenAFlakyFunction(2);
    const executionArn = await statesTaskExecutionFactory.make(
      {
        task: invokeCheck([
          {
            ErrorEquals: ["States.ALL"],
            IntervalSeconds: 10,
            BackoffRate: 10,
            MaxDelaySeconds: 20,
          },
        ]),
      },
      simAws,
    );

    // When the clock passes the whole backoff.
    await simAws.clock().advanceBy({ minutes: 5 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then the second wait was the cap rather than the hundred seconds the
    // rate asked for, so the third attempt ran thirty seconds in.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.stopDate?.toISOString(),
      "2026-07-26T09:00:30.000Z",
    );
  });
});
