import {
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionFactory } from "../../../test/stepfunctions/states-execution.factory.js";
import { statesTaskFunctionFactory } from "../../../test/stepfunctions/states-task-function.factory.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";
import type { JSONObject } from "../../util/type-guard/json.js";
import { SimAws } from "../aws/sim-aws.js";

describe("Simulated Step Functions context object", () => {
  const startedAt = new Date("2026-07-26T09:00:00.000Z");

  /**
   * Run a workflow of one state and read back what it produced.
   */
  async function outputOf(simAws: SimAws, state: JSONObject): Promise<unknown> {
    const executionArn = await statesExecutionFactory.make(
      { state, input: '{"student":"Wei"}' },
      simAws,
    );
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertIdentical(described.status, "SUCCEEDED");

    return JSON.parse(described.output ?? "null") as unknown;
  }

  it("reads what the execution and its state machine are called", async () => {
    // Given a Pass state building its result out of the context object.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });

    // When it runs.
    const output = await outputOf(simAws, {
      Type: "Pass",
      Parameters: {
        "execution.$": "$$.Execution.Name",
        "id.$": "$$.Execution.Id",
        "started.$": "$$.Execution.StartTime",
        "role.$": "$$.Execution.RoleArn",
        "input.$": "$$.Execution.Input",
        "machine.$": "$$.StateMachine.Name",
      },
      End: true,
    });

    // Then each field holds what the execution was started with.
    assertObjectEquals(output, {
      execution: "execution-1",
      id: `arn:aws:states:${simAws.defaultRegionName}:${simAws.defaultAccountId}:execution:Enrolment:execution-1`,
      started: "2026-07-26T09:00:00.000Z",
      role: `arn:aws:iam::${simAws.defaultAccountId}:role/WorkflowRole`,
      input: { student: "Wei" },
      machine: "Enrolment",
    });
  });

  it("reads what the state running is called and when it was entered", async () => {
    // Given a state reading its own entry in the context object.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });

    // When it runs.
    const output = await outputOf(simAws, {
      Type: "Pass",
      Parameters: {
        "state.$": "$$.State.Name",
        "entered.$": "$$.State.EnteredTime",
        "retries.$": "$$.State.RetryCount",
      },
      End: true,
    });

    // Then the state names itself, and has taken no retries.
    assertObjectEquals(output, {
      state: "Check",
      entered: "2026-07-26T09:00:00.000Z",
      retries: 0,
    });
  });

  it("counts the retries one entry to a state has taken", async () => {
    // Given a task that fails once, and answers with what it was sent after
    // that.
    const simAws = new SimAws();
    let called = 0;
    const check = await statesTaskFunctionFactory.make(
      {
        handler: (event: unknown): unknown => {
          called += 1;

          if (called === 1) {
            throw new Error("the enrolment service is down");
          }

          return event;
        },
      },
      simAws,
    );
    const executionArn = await statesExecutionFactory.make(
      {
        state: {
          Type: "Task",
          Resource: check.arn,
          Parameters: { "retries.$": "$$.State.RetryCount" },
          Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 5 }],
          End: true,
        },
      },
      simAws,
    );

    // When the clock passes the wait before the retry.
    await simAws.clock().advanceBy({ seconds: 10 });

    // Then the attempt that came good was the first retry.
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertIdentical(described.output, '{"retries":1}');
  });

  it("reads the context object from a path and an intrinsic function", async () => {
    // Given an OutputPath and an intrinsic argument reading `$$`.
    const simAws = new SimAws();

    // When each runs.
    const narrowed = await outputOf(simAws, {
      Type: "Pass",
      OutputPath: "$$.Execution.Input",
      End: true,
    });
    const formatted = await outputOf(new SimAws(), {
      Type: "Pass",
      Parameters: {
        "greeting.$":
          "States.Format('Enrolling {}', $$.Execution.Input.student)",
      },
      End: true,
    });

    // Then both read the context object rather than the state's input.
    assertObjectEquals(narrowed, { student: "Wei" });
    assertObjectEquals(formatted, { greeting: "Enrolling Wei" });
  });

  it("refuses a path that writes into the context object", async () => {
    // Given a state whose ResultPath writes into the context object.
    const simAws = new SimAws();
    const executionArn = await statesExecutionFactory.make(
      {
        state: { Type: "Pass", ResultPath: "$$.State.Name", End: true },
      },
      simAws,
    );

    // When it runs.
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then the state failed, since the context object is read rather than
    // written.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.QueryEvaluationError");
    assertStringIncludes(described.cause ?? "", "context object");
  });
});
