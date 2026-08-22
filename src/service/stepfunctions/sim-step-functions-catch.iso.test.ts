import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesFlakyHandlerFactory } from "../../../test/stepfunctions/states-flaky-handler.factory.js";
import { statesExecutionFactory } from "../../../test/stepfunctions/states-execution.factory.js";
import { statesTaskFunctionFactory } from "../../../test/stepfunctions/states-task-function.factory.js";
import type { JSONObject } from "../../util/type-guard/json.js";
import { SimAws } from "../aws/sim-aws.js";
import type { SimDescribeExecutionCommandOutput } from "./command/execution/execution.command.js";

describe("Simulated Step Functions Catch", () => {
  /**
   * An error of a workflow's own, as one a Catch names is written.
   */
  class NotEligible extends Error {
    public override readonly name = "NotEligible";
  }

  /**
   * The states a caught failure can be sent to, either of which ends the
   * execution with what reaches it.
   */
  const compensating: JSONObject = {
    Compensate: { Type: "Pass", End: true },
    Decline: { Type: "Pass", Result: { declined: true }, End: true },
  };

  /**
   * Run a workflow whose first state is the task under test, and read back how
   * the execution ended.
   */
  async function runWorkflow(
    simAws: SimAws,
    state: JSONObject,
    input = '{"student":"Wei"}',
  ): Promise<{
    readonly described: SimDescribeExecutionCommandOutput;
    readonly executionArn: string;
  }> {
    const executionArn = await statesExecutionFactory.make(
      { state, states: compensating, input },
      simAws,
    );

    return {
      described: await simAws
        .stepFunctions()
        .describeExecution({ input: { executionArn } }),
      executionArn,
    };
  }

  /**
   * A simulation holding a function that always raises.
   */
  async function givenAFailingFunction(): Promise<SimAws> {
    const simAws = new SimAws();

    await statesTaskFunctionFactory.make(
      { handler: statesFlakyHandlerFactory.make({ failures: 10 }) },
      simAws,
    );

    return simAws;
  }

  /**
   * The task the tests below run, which invokes that function.
   */
  function invokeCheck(caught: JSONObject[]): JSONObject {
    return {
      Type: "Task",
      Resource: "arn:aws:states:::lambda:invoke",
      Parameters: { FunctionName: "check-enrolment", "Payload.$": "$" },
      Catch: caught,
      End: true,
    };
  }

  it("sends a caught failure on, writing the error into the input", async () => {
    // Given a workflow whose task compensates for its own failure.
    const simAws = await givenAFailingFunction();

    // When the task fails.
    const { described, executionArn } = await runWorkflow(
      simAws,
      invokeCheck([
        {
          ErrorEquals: ["States.ALL"],
          Next: "Compensate",
          ResultPath: "$.error",
        },
      ]),
    );

    // Then the execution went on to the compensating branch, carrying the
    // error beside the data the task was given.
    assertIdentical(described.status, "SUCCEEDED");
    assertObjectEquals(JSON.parse(described.output ?? "null") as unknown, {
      student: "Wei",
      error: {
        Error: "States.TaskFailed",
        Cause:
          "The function the Task state Check invoked raised Error: the " +
          "enrolment service is down",
      },
    });
    assertObjectEquals(
      simAws.stepFunctions().inspection().visitedStates(executionArn),
      ["Check", "Compensate"],
    );
  });

  it("catches a task whose retrier has run out of attempts", async () => {
    // Given a task that is retried once and caught after that.
    const simAws = await givenAFailingFunction();
    const executionArn = await statesExecutionFactory.make(
      {
        state: {
          ...invokeCheck([{ ErrorEquals: ["States.ALL"], Next: "Compensate" }]),
          Retry: [
            {
              ErrorEquals: ["States.TaskFailed"],
              IntervalSeconds: 5,
              MaxAttempts: 1,
            },
          ],
        },
        states: compensating,
      },
      simAws,
    );

    // When the clock passes the one retry it had.
    await simAws.clock().advanceBy({ seconds: 10 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then the retries were spent first and the catcher took what was left.
    assertIdentical(described.status, "SUCCEEDED");
    assertArrayLength(
      simAws.stepFunctions().inspection().attempts(executionArn),
      3,
    );
    assertObjectEquals(
      simAws.stepFunctions().inspection().visitedStates(executionArn),
      ["Check", "Compensate"],
    );
  });

  it("takes the first catcher that names the error", async () => {
    // Given a function raising an error of the workflow's own, invoked
    // through its ARN so the error keeps its name.
    const simAws = new SimAws();
    const check = await statesTaskFunctionFactory.make(
      {
        handler: statesFlakyHandlerFactory.make({
          failures: 10,
          raises: (): Error => new NotEligible("no place left"),
        }),
      },
      simAws,
    );

    // When the task fails.
    const { described } = await runWorkflow(simAws, {
      Type: "Task",
      Resource: check.arn,
      Catch: [
        { ErrorEquals: ["NotEligible"], Next: "Decline", ResultPath: null },
        { ErrorEquals: ["States.ALL"], Next: "Compensate" },
      ],
      End: true,
    });

    // Then the catcher naming the handler's own error took it, and its
    // ResultPath of null passed the input on as it was.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '{"declined":true}');
  });

  it("replaces the input with the error where a catcher has no ResultPath", async () => {
    // Given a catcher written without one.
    const simAws = await givenAFailingFunction();

    // When the task fails.
    const { described } = await runWorkflow(
      simAws,
      invokeCheck([{ ErrorEquals: ["States.TaskFailed"], Next: "Compensate" }]),
    );

    // Then the state it goes to is given the error alone, which is what a
    // ResultPath of $ does.
    assertIdentical(described.status, "SUCCEEDED");
    assertObjectEquals(
      Object.keys(JSON.parse(described.output ?? "null") as object),
      ["Error", "Cause"],
    );
  });

  it("leaves a failure no catcher names to the execution", async () => {
    // Given a catcher naming something else.
    const simAws = await givenAFailingFunction();

    // When the task fails.
    const { described } = await runWorkflow(
      simAws,
      invokeCheck([
        { ErrorEquals: ["ThrottlingException"], Next: "Compensate" },
      ]),
    );

    // Then the execution ended at the task.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.TaskFailed");
  });

  it("leaves a States.Runtime failure uncaught, whatever States.ALL says", async () => {
    // Given a task reading the function to invoke out of its input, and an
    // input holding a number there.
    const simAws = await givenAFailingFunction();

    // When the task cannot work out what to invoke.
    const { described } = await runWorkflow(
      simAws,
      {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { "FunctionName.$": "$.checker", "Payload.$": "$" },
        Catch: [{ ErrorEquals: ["States.ALL"], Next: "Compensate" }],
        End: true,
      },
      '{"checker":42}',
    );

    // Then the execution failed rather than compensating. Real Step Functions
    // neither retries nor catches this one.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.Runtime");
  });

  it("fails the execution where a catcher's ResultPath has nowhere to write", async () => {
    // Given a catcher writing the error into a field of a string.
    const simAws = await givenAFailingFunction();

    // When the task fails on an input the path cannot be written into.
    const { described } = await runWorkflow(
      simAws,
      invokeCheck([
        {
          ErrorEquals: ["States.ALL"],
          Next: "Compensate",
          ResultPath: "$.student.error",
        },
      ]),
    );

    // Then the execution failed the way any other path that cannot be applied
    // fails one, rather than the failure being swallowed.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.ResultPathMatchFailure");
  });
});
