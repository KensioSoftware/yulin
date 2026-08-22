import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesFlakyHandlerFactory } from "../../../test/stepfunctions/states-flaky-handler.factory.js";
import { statesExecutionFactory } from "../../../test/stepfunctions/states-execution.factory.js";
import { statesTaskFunctionFactory } from "../../../test/stepfunctions/states-task-function.factory.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";
import type { JSONObject } from "../../util/type-guard/json.js";
import { SimAws } from "../aws/sim-aws.js";

describe("Which retrier takes a failing task", () => {
  /**
   * Two failures a workflow tells apart, as its own errors are written.
   */
  class Throttled extends Error {
    public override readonly name = "Throttled";
  }

  class Unavailable extends Error {
    public override readonly name = "Unavailable";
  }

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

  it("fails the execution once a retrier runs out of attempts", async () => {
    // Given a function that never comes good, retried twice.
    const simAws = await givenAFlakyFunction(10);
    const executionArn = await statesExecutionFactory.make(
      {
        state: invokeCheck([
          {
            ErrorEquals: ["States.TaskFailed"],
            IntervalSeconds: 2,
            MaxAttempts: 2,
          },
        ]),
      },
      simAws,
    );

    // When the clock passes every attempt it had left.
    await simAws.clock().advanceBy({ minutes: 1 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then advancing the clock returned as it would for an execution that
    // succeeded, and the failure is read off the execution.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.TaskFailed");
    assertArrayLength(
      simAws.stepFunctions().inspection().attempts(executionArn),
      3,
    );
  });

  it("leaves a failure no retrier names to the execution", async () => {
    // Given a retrier that names a throttled write, and a task that failed
    // for another reason.
    const simAws = await givenAFlakyFunction(10);
    const executionArn = await statesExecutionFactory.make(
      {
        state: invokeCheck([
          { ErrorEquals: ["ThrottlingException"], IntervalSeconds: 2 },
        ]),
      },
      simAws,
    );
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then the task ran once and the execution ended there.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.TaskFailed");
    assertArrayLength(
      simAws.stepFunctions().inspection().attempts(executionArn),
      1,
    );
  });

  it("takes the first retrier that names the error", async () => {
    // Given a retrier that does not match ahead of one that does.
    const simAws = await givenAFlakyFunction(1);
    const executionArn = await statesExecutionFactory.make(
      {
        state: invokeCheck([
          { ErrorEquals: ["ThrottlingException"], IntervalSeconds: 300 },
          { ErrorEquals: ["States.ALL"], IntervalSeconds: 2 },
        ]),
      },
      simAws,
    );

    // When the clock passes the second retrier's interval alone.
    await simAws.clock().advanceBy({ seconds: 3 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then the retry waited the two seconds the matching retrier asked for
    // rather than the five minutes of the one above it.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.stopDate?.toISOString(),
      "2026-07-26T09:00:02.000Z",
    );
  });

  it("counts a retrier's attempts against that retrier alone", async () => {
    // Given a task that fails one way and then another, each named by its own
    // retrier. The function ARN form reports a handler's error type, so the
    // two failures reach the retriers under different names.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
    });
    const check = await statesTaskFunctionFactory.make(
      {
        handler: statesFlakyHandlerFactory.make({
          failures: 2,
          raises: (call): Error =>
            call === 1
              ? new Throttled("the enrolment service is busy")
              : new Unavailable("the enrolment service is down"),
        }),
      },
      simAws,
    );
    const executionArn = await statesExecutionFactory.make(
      {
        state: {
          Type: "Task",
          Resource: check.arn,
          Retry: [
            { ErrorEquals: ["Throttled"], IntervalSeconds: 2, MaxAttempts: 1 },
            {
              ErrorEquals: ["Unavailable"],
              IntervalSeconds: 4,
              MaxAttempts: 1,
            },
          ],
          End: true,
        },
      },
      simAws,
    );

    // When the clock passes both waits.
    await simAws.clock().advanceBy({ minutes: 1 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then each retrier spent its own single attempt, so the task ran three
    // times: two seconds after the first failure and four after the second.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.stopDate?.toISOString(),
      "2026-07-26T09:00:06.000Z",
    );
    assertObjectEquals(
      simAws.stepFunctions().inspection().attempts(executionArn),
      [
        { stateName: "Check", error: "Throttled" },
        { stateName: "Check", error: "Unavailable" },
        { stateName: "Check" },
      ],
    );
  });
});
